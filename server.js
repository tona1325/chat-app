// server.js
require('dotenv').config(); // Load biến môi trường từ .env
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');
const path = require('path'); // Thêm path để xử lý đường dẫn file

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const saltRounds = 10;

app.use(express.json()); // Middleware để parse JSON request body
app.use(express.static(path.join(__dirname, 'public'))); // Phục vụ các file tĩnh trong thư mục 'public' một cách chuẩn hơn

// --- Routes ---

// Route cơ bản để phục vụ trang login (trang gốc)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Các route khác cũng nên dùng path.join cho an toàn
app.get('/login.html', (req, res) => {
     res.sendFile(path.join(__dirname, 'public', 'login.html'));
});
app.get('/index.html', (req, res) => {
     res.sendFile(path.join(__dirname, 'public', 'index.html'));
});


// Route đăng ký
app.post('/signup', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        console.log("Signup attempt failed: Missing username or password");
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        console.log(`Signup attempt for username: ${username}`);
        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            console.log(`Signup failed: Username ${username} already taken`);
            return res.status(409).json({ message: 'Username already taken' });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUser = await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
            },
        });
        console.log('User created successfully:', newUser.username, 'ID:', newUser.id);
        // Không trả về password hash
        res.status(201).json({ message: 'User created successfully', userId: newUser.id, username: newUser.username });

    } catch (error) {
        console.error("!!! SIGNUP SERVER ERROR !!!:", error); // Log lỗi chi tiết ra console backend
        res.status(500).json({ message: 'Internal server error during signup' }); // Thông báo lỗi chung chung cho client
    }
});

// Route đăng nhập
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        console.log("Login attempt failed: Missing username or password");
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        console.log(`Login attempt for username: ${username}`);
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            console.log(`Login failed: User ${username} not found`);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log(`Login failed: Incorrect password for ${username}`);
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        console.log('User logged in successfully:', user.username, 'ID:', user.id);
        // Đăng nhập thành công, trả về thông tin user (không có password)
        res.status(200).json({ message: 'Login successful', userId: user.id, username: user.username });

    } catch (error) {
        console.error("!!! LOGIN SERVER ERROR !!!:", error); // Log lỗi chi tiết
        res.status(500).json({ message: 'Internal server error during login' });
    }
});


// --- Socket.IO Logic ---
const activeUsers = {}; // Lưu thông tin user đang kết nối { socketId: { username, userId, currentRoom } }

io.on('connection', (socket) => {
    console.log('A user connected via Socket.IO:', socket.id);

    // Xử lý khi user tham gia phòng chat
    socket.on('joinRoom', async ({ username, userId, room }) => {
        // userId từ client đến đây có thể vẫn là string từ localStorage
        const currentUserId = userId; // Giữ lại giá trị gốc nếu cần
        const currentUsername = username;
        const targetRoom = room;

        if (!currentUserId || !currentUsername || !targetRoom) {
             console.error("Join room failed: Missing data", { username, userId, room });
             socket.emit('chatError', { message: 'Failed to join room. Invalid data.' });
             return;
        }

        console.log(`${currentUsername} (ID: ${currentUserId}, Socket: ${socket.id}) is joining room: ${targetRoom}`);

        // Lưu thông tin user và phòng hiện tại vào activeUsers
        // userId lưu ở đây vẫn có thể là string, sẽ xử lý khi cần dùng cho Prisma
        activeUsers[socket.id] = { username: currentUsername, userId: currentUserId, currentRoom: targetRoom };

        // Tham gia vào "room" của Socket.IO
        socket.join(targetRoom);

        // Thông báo cho những người khác trong phòng là có người mới vào
        socket.to(targetRoom).emit('userJoined', { username: currentUsername });

        // Gửi lịch sử chat của phòng này cho user vừa vào
        try {
            const messages = await prisma.message.findMany({
                where: { room: targetRoom },
                orderBy: { createdAt: 'asc' },
                take: 50, // Lấy 50 tin nhắn gần nhất
                include: { user: { select: { username: true } } } // Lấy cả username của người gửi
            });

            // Format lại dữ liệu trước khi gửi về client
            const formattedMessages = messages.map(msg => ({
                username: msg.user.username,
                text: msg.text,
                room: msg.room,
                createdAt: msg.createdAt.toISOString() // Gửi dạng ISO string cho nhất quán
            }));

            socket.emit('loadHistory', formattedMessages);
            // Thông báo cho user biết đã vào phòng thành công
            socket.emit('joinedRoom', { room: targetRoom });
            console.log(`Sent history and joined confirmation to ${currentUsername} for room ${targetRoom}`);

        } catch (error) {
            console.error(`Error fetching history for room ${targetRoom}:`, error);
            socket.emit('chatError', { message: `Error loading chat history for room ${targetRoom}.` });
        }
    });

    // Xử lý khi user gửi tin nhắn
    socket.on('sendMessage', async (data) => {
        const senderInfo = activeUsers[socket.id];

        if (!senderInfo) {
            console.error("Error sending message: User info not found for socket:", socket.id);
            socket.emit('chatError', { message: 'Authentication error. Please refresh and log in again.' });
            return;
        }

        const { message, room } = data;
        const { username } = senderInfo;
        // Lấy userId từ senderInfo và đảm bảo nó là số nguyên
        const userIdFromString = senderInfo.userId; // Đây là string từ localStorage
        const userIdInt = parseInt(userIdFromString, 10); // *** SỬA LỖI Ở ĐÂY *** Chuyển sang số nguyên

        if (!message || !room) {
            console.error("Error sending message: Missing message or room", { message, room });
            socket.emit('chatError', { message: 'Cannot send empty message or message without a room.' });
            return;
        }

        if (isNaN(userIdInt)) {
             console.error("Error sending message: Invalid userId after parseInt", { userIdFromString, userIdInt });
             socket.emit('chatError', { message: 'Internal error: Invalid user ID.' });
             return;
        }

        console.log(`Attempting to save message from ${username} (ID: ${userIdInt}) in room ${room}: ${message}`);

        // Lưu tin nhắn vào database
        try {
            const savedMessage = await prisma.message.create({
                data: {
                    text: message,
                    room: room,
                    userId: userIdInt, // <-- Sử dụng userId đã được parseInt
                }
            });
            console.log(`Message saved successfully. ID: ${savedMessage.id}`);

            // Gửi tin nhắn đến tất cả mọi người trong phòng đó (bao gồm cả người gửi)
            io.to(room).emit('newMessage', {
                username: username,
                text: savedMessage.text,
                room: savedMessage.room,
                createdAt: savedMessage.createdAt.toISOString() // Gửi dạng ISO string
            });

        } catch (error) {
            // Phân biệt lỗi validation và lỗi server khác nếu cần
             if (error.code === 'P2002' || error.code === 'P2003') { // Ví dụ: Lỗi khóa ngoại
                 console.error("Error saving message (Foreign Key or Unique Constraint):", error);
                 socket.emit('chatError', { message: 'Error sending message due to data conflict.' });
             } else if (error instanceof require('@prisma/client/runtime/library').PrismaClientValidationError) {
                 console.error("Error saving message (Validation Error):", error);
                 socket.emit('chatError', { message: 'Error sending message. Invalid data format.'});
             }
             else {
                console.error("!!! ERROR SAVING MESSAGE !!!:", error); // Log lỗi chi tiết
                socket.emit('chatError', { message: 'Server error occurred while sending message.' });
             }
        }
    });

    // Xử lý khi user đổi phòng (hoặc rời đi mà không ngắt kết nối)
    socket.on('leaveRoom', (room) => {
        const userInfo = activeUsers[socket.id];
        if (userInfo && userInfo.currentRoom === room) {
            console.log(`${userInfo.username} (Socket: ${socket.id}) left room ${room}`);
            socket.leave(room);
            socket.to(room).emit('userLeft', { username: userInfo.username });
            // Cập nhật user không còn ở phòng này nữa, nhưng vẫn giữ thông tin user
            userInfo.currentRoom = null;
        } else if (userInfo) {
             console.log(`User ${userInfo.username} tried to leave room ${room}, but was in ${userInfo.currentRoom}`);
        } else {
             console.log(`Socket ${socket.id} tried to leave room ${room} but user info not found.`);
        }
    });


    // Xử lý khi user ngắt kết nối hoàn toàn
    socket.on('disconnect', (reason) => {
        const userInfo = activeUsers[socket.id];
        if (userInfo) {
            console.log(`${userInfo.username} (Socket: ${socket.id}) disconnected. Reason: ${reason}`);
            // Thông báo cho những người trong phòng cuối cùng của user biết họ đã rời đi
            if (userInfo.currentRoom) {
                socket.to(userInfo.currentRoom).emit('userLeft', { username: userInfo.username });
                 console.log(`Notified room ${userInfo.currentRoom} about ${userInfo.username} leaving.`);
            }
            delete activeUsers[socket.id]; // Xóa user khỏi danh sách active
            console.log("Remaining active users:", Object.keys(activeUsers).length);
        } else {
            console.log(`Socket ${socket.id} disconnected without user info found. Reason: ${reason}`);
        }
    });
});

// Xử lý lỗi chung (ví dụ: không tìm thấy route) - Đặt ở cuối cùng
app.use((req, res, next) => {
  res.status(404).send("Sorry, can't find that!");
});

// Middleware xử lý lỗi chung của Express - Đặt ở cuối cùng
app.use((err, req, res, next) => {
  console.error("!!! UNHANDLED EXPRESS ERROR !!!:", err.stack);
  res.status(500).send('Something broke on the server!');
});


// Khởi động server
server.listen(PORT, () => {
    console.log(`------------------------------------`);
    console.log(`Server listening on port ${PORT}`);
    console.log(`Access the app at: http://localhost:${PORT}`); // Hoặc URL public nếu có
    console.log(`------------------------------------`);
});

// Đóng Prisma Client khi ứng dụng tắt (quan trọng cho clean shutdown)
process.on('SIGINT', async () => {
    console.log('Received SIGINT. Closing server and Prisma Client...');
    await prisma.$disconnect();
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});
process.on('SIGTERM', async () => {
     console.log('Received SIGTERM. Closing server and Prisma Client...');
    await prisma.$disconnect();
    server.close(() => {
        console.log('Server closed.');
        process.exit(0);
    });
});