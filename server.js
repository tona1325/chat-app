// server.js
require('dotenv').config(); // Load biến môi trường từ .env
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000; // Dùng cổng từ env hoặc mặc định 3000
const saltRounds = 10; // Độ phức tạp cho bcrypt

app.use(express.json()); // Middleware để parse JSON request body
app.use(express.static('public')); // Phục vụ các file tĩnh trong thư mục 'public'

// --- Routes ---

// Route cơ bản để phục vụ trang login
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

// Route đăng ký
app.post('/signup', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        const existingUser = await prisma.user.findUnique({ where: { username } });
        if (existingUser) {
            return res.status(409).json({ message: 'Username already taken' });
        }

        const hashedPassword = await bcrypt.hash(password, saltRounds);
        const newUser = await prisma.user.create({
            data: {
                username,
                password: hashedPassword,
            },
        });
        console.log('User created:', newUser.username);
        // Không trả về password hash
        res.status(201).json({ message: 'User created successfully', userId: newUser.id, username: newUser.username });

    } catch (error) {
        console.error("Signup Error:", error);
        res.status(500).json({ message: 'Error creating user' });
    }
});

// Route đăng nhập
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: 'Username and password are required' });
    }

    try {
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        console.log('User logged in:', user.username);
        // Đăng nhập thành công, trả về thông tin user (không có password)
        res.status(200).json({ message: 'Login successful', userId: user.id, username: user.username });

    } catch (error) {
        console.error("Login Error:", error);
        res.status(500).json({ message: 'Error logging in' });
    }
});


// --- Socket.IO Logic ---
const activeUsers = {}; // Lưu thông tin user đang kết nối { socketId: { username, userId, currentRoom } }

// server.js

// ... các phần khác ...

io.on('connection', (socket) => {
    // ... các hàm xử lý khác (joinRoom, disconnect, ...)

    // SỬA TRONG HÀM NÀY:
    socket.on('sendMessage', async (data) => {
        const senderInfo = activeUsers[socket.id];
        if (!senderInfo) {
            console.error("Error: User info not found for socket:", socket.id);
            socket.emit('chatError', { message: 'Authentication error. Please refresh.' });
            return;
        }

        const { message, room } = data;
        const { username, userId } = senderInfo; // userId ở đây là string

        console.log(`Message from ${username} in room ${room}: ${message}`);

        if(!room) {
            console.error("Error: Room not specified by client.");
            socket.emit('chatError', { message: 'No room selected.' });
            return;
        }

        // --- THÊM BƯỚC CHUYỂN ĐỔI ---
        const numericUserId = parseInt(userId, 10); // Chuyển userId sang số nguyên (hệ 10)

        // Kiểm tra xem chuyển đổi có thành công không (quan trọng nếu userId có thể không hợp lệ)
        if (isNaN(numericUserId)) {
            console.error(`Invalid userId format received for user ${username}: ${userId}`);
             socket.emit('chatError', { message: 'Internal server error processing your request.' });
            return;
        }
        // --- KẾT THÚC BƯỚC CHUYỂN ĐỔI ---


        // Lưu tin nhắn vào database
        try {
            const savedMessage = await prisma.message.create({
                data: {
                    text: message,
                    room: room,
                    // Sử dụng giá trị số nguyên đã chuyển đổi
                    userId: numericUserId,
                }
            });

            // Gửi tin nhắn đến tất cả mọi người trong phòng đó (bao gồm cả người gửi)
            io.to(room).emit('newMessage', {
                username: username,
                text: savedMessage.text,
                room: savedMessage.room,
                createdAt: savedMessage.createdAt
            });

        } catch (error) {
            console.error("Error saving message:", error);
            // Có thể gửi thông báo lỗi cụ thể hơn nếu là validation error, nhưng lỗi chung cũng được
            socket.emit('chatError', { message: 'Error sending message.' });
        }
    });

    // ... các hàm xử lý khác ...
});

// ... phần khởi động server ...
    // Xử lý khi user gửi tin nhắn
    socket.on('sendMessage', async (data) => {
        const senderInfo = activeUsers[socket.id];
        if (!senderInfo) {
            console.error("Error: User info not found for socket:", socket.id);
            // Có thể gửi lỗi về client
            socket.emit('chatError', { message: 'Authentication error. Please refresh.' });
            return;
        }

        const { message, room } = data; // Nhận room từ client
        const { username, userId } = senderInfo;

        console.log(`Message from ${username} in room ${room}: ${message}`);

        if(!room) {
            console.error("Error: Room not specified by client.");
            socket.emit('chatError', { message: 'No room selected.' });
            return;
        }

        // Lưu tin nhắn vào database
        try {
            const savedMessage = await prisma.message.create({
                data: {
                    text: message,
                    room: room,
                    userId: userId,
                }
            });

            // Gửi tin nhắn đến tất cả mọi người trong phòng đó (bao gồm cả người gửi)
            io.to(room).emit('newMessage', {
                username: username,
                text: savedMessage.text,
                room: savedMessage.room,
                createdAt: savedMessage.createdAt
            });

        } catch (error) {
            console.error("Error saving message:", error);
             socket.emit('chatError', { message: 'Error sending message.' });
        }
    });

    // Xử lý khi user đổi phòng
    socket.on('leaveRoom', (room) => {
        const userInfo = activeUsers[socket.id];
        if(userInfo && userInfo.currentRoom === room) {
            console.log(`${userInfo.username} left room ${room}`);
            socket.leave(room);
            socket.to(room).emit('userLeft', { username: userInfo.username });
            userInfo.currentRoom = null; // Cập nhật user không còn ở phòng này nữa
        }
    });


    // Xử lý khi user ngắt kết nối
    socket.on('disconnect', () => {
        const userInfo = activeUsers[socket.id];
        if (userInfo) {
            console.log(`${userInfo.username} disconnected`);
            // Thông báo cho những người trong phòng cuối cùng của user biết họ đã rời đi
            if(userInfo.currentRoom) {
                socket.to(userInfo.currentRoom).emit('userLeft', { username: userInfo.username });
            }
            delete activeUsers[socket.id]; // Xóa user khỏi danh sách active
        } else {
             console.log('A user disconnected:', socket.id);
        }
    });
});

// Khởi động server
server.listen(PORT, () => {
    console.log(`Server listening on *:${PORT}`);
});