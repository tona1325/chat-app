// client.js
document.addEventListener('DOMContentLoaded', () => { // Đợi DOM load xong

    const socket = io(); // Kết nối tới Socket.IO server

    // Lấy thông tin user từ localStorage
    const username = localStorage.getItem('chatUsername');
    const userId = localStorage.getItem('chatUserId');

    // Lấy các element DOM
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const messagesContainer = document.getElementById('messages');
    const roomList = document.getElementById('room-list');
    const newRoomNameInput = document.getElementById('new-room-name');
    const createRoomBtn = document.getElementById('create-room-btn');
    const currentRoomTitle = document.getElementById('current-room-title');
    const displayUsername = document.getElementById('display-username');
    const logoutBtn = document.getElementById('logout-btn');
    const errorMessage = document.getElementById('error-message');
    // const typingIndicator = document.getElementById('typing-indicator'); // Nếu có

    let currentRoom = null; // Phòng chat hiện tại
    let initialLoad = true; // Cờ để biết có phải lần load đầu tiên không

    // --- Authentication Check ---
    if (!username || !userId) {
        // Nếu không có thông tin user, quay lại trang login
        console.warn("User not found in localStorage. Redirecting to login.");
        window.location.href = '/login.html'; // Đảm bảo chuyển hướng đến trang login
        return; // Dừng thực thi code tiếp theo
    } else {
        console.log(`Logged in as: ${username} (ID: ${userId})`);
        displayUsername.textContent = username; // Hiển thị username
    }

    // --- Room Handling ---

    // Hàm để tham gia phòng chat
    function joinRoom(roomName) {
        errorMessage.textContent = '';
        if (currentRoom === roomName && !initialLoad) return; // Đã ở trong phòng này rồi (trừ lần load đầu)

        // Rời phòng cũ (nếu có và không phải lần load đầu)
        if (currentRoom && !initialLoad) {
            socket.emit('leaveRoom', currentRoom);
            console.log(`Leaving room: ${currentRoom}`);
            // Thông báo rời phòng có thể hiển thị ngay hoặc chờ xác nhận từ server
            // displaySystemMessage(`You left ${currentRoom}`);
        }

        console.log(`Attempting to join room: ${roomName}`);
        currentRoom = roomName;
        messagesContainer.innerHTML = ''; // Xóa tin nhắn cũ
        displaySystemMessage(`Joining room: ${roomName}...`); // Thông báo đang vào phòng
        messageInput.disabled = true;
        sendButton.disabled = true;
        messageInput.placeholder = "Loading messages..."; // Thay đổi placeholder

        // Gửi sự kiện joinRoom lên server
        socket.emit('joinRoom', { username, userId, room: roomName });

        // Cập nhật UI
        currentRoomTitle.textContent = `Room: ${roomName}`;
        document.querySelectorAll('#room-list li').forEach(li => {
            li.classList.remove('active');
            if (li.getAttribute('data-room') === roomName) {
                li.classList.add('active');
            }
        });
        initialLoad = false; // Đánh dấu đã qua lần load đầu
    }

    // Xử lý sự kiện click vào tên phòng trong danh sách
    roomList.addEventListener('click', (e) => {
        if (e.target && e.target.tagName === 'LI') {
            const roomToJoin = e.target.getAttribute('data-room');
            if (roomToJoin) {
                joinRoom(roomToJoin);
            }
        }
    });

    // Xử lý tạo và tham gia phòng mới
    function handleCreateAndJoinRoom() {
        const newRoomRaw = newRoomNameInput.value.trim();
        if (newRoomRaw) {
             // Chuẩn hóa tên phòng cho ID (chỉ chữ thường, số, dấu gạch ngang)
            const newRoomId = newRoomRaw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

            if (!newRoomId) {
                errorMessage.textContent = 'Invalid room name.';
                return;
            }

            let roomExists = false;
            document.querySelectorAll('#room-list li').forEach(li => {
                if (li.getAttribute('data-room') === newRoomId) {
                    roomExists = true;
                }
            });

            if (!roomExists) {
                const newRoomLi = document.createElement('li');
                newRoomLi.setAttribute('data-room', newRoomId);
                newRoomLi.textContent = newRoomRaw; // Hiển thị tên gốc
                roomList.appendChild(newRoomLi);
            }

            joinRoom(newRoomId); // Tham gia bằng ID đã chuẩn hóa
            newRoomNameInput.value = '';
        } else {
             errorMessage.textContent = 'Please enter a room name.';
        }
    }

    createRoomBtn.addEventListener('click', handleCreateAndJoinRoom);
    newRoomNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleCreateAndJoinRoom();
        }
    });


    // --- Message Handling ---

    function sendMessage() {
        const messageText = messageInput.value.trim();
        errorMessage.textContent = '';

        if (messageText && currentRoom) {
            console.log(`Sending message to room ${currentRoom}: ${messageText}`);
            socket.emit('sendMessage', { message: messageText, room: currentRoom });
            messageInput.value = '';
            messageInput.focus(); // Focus lại input sau khi gửi
        } else if (!currentRoom) {
            errorMessage.textContent = 'Please select or create a room first.';
        } else if (!messageText) {
             // Có thể không cần báo lỗi nếu chỉ là khoảng trắng
             // errorMessage.textContent = 'Cannot send empty message.';
        }
    }

    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) { // Gửi khi nhấn Enter (trừ Shift+Enter)
            e.preventDefault(); // Ngăn xuống dòng mặc định
            sendMessage();
        }
        // Có thể thêm logic emit 'typing' ở đây
    });

    // --- Socket Event Listeners ---

    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        errorMessage.textContent = ''; // Xóa lỗi cũ (nếu có)
        // Tự động join lại phòng cuối cùng nếu có (lưu phòng vào localStorage?)
        // Hoặc yêu cầu user chọn lại phòng
        // Nếu cần join lại:
        // const lastRoom = localStorage.getItem('lastChatRoom');
        // if (lastRoom) joinRoom(lastRoom);
        // else {
        //     currentRoomTitle.textContent = "Select a Room";
        //     messageInput.disabled = true;
        //     sendButton.disabled = true;
        // }
         currentRoomTitle.textContent = "Select a Room";
         messageInput.disabled = true;
         sendButton.disabled = true;
         messageInput.placeholder = "Select a room to start chatting";
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        displaySystemMessage(`Disconnected: ${reason}. Attempting to reconnect...`);
        messageInput.disabled = true;
        sendButton.disabled = true;
        currentRoomTitle.textContent = "Disconnected";
        currentRoom = null; // Reset phòng hiện tại
        document.querySelectorAll('#room-list li').forEach(li => li.classList.remove('active'));
    });

    socket.on('joinedRoom', ({ room }) => {
        console.log(`Successfully joined room: ${room}`);
        messagesContainer.innerHTML = ''; // Xóa thông báo "Joining..."
        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.placeholder = "Enter message...";
        messageInput.focus();
        // localStorage.setItem('lastChatRoom', room); // Lưu phòng cuối cùng
    });

    socket.on('newMessage', (data) => {
        console.log('Received message:', data);
         // Chỉ hiển thị tin nhắn nếu nó thuộc về phòng hiện tại
        if(data.room === currentRoom) {
            displayMessage(data.username, data.text, new Date(data.createdAt));
        } else {
            console.log(`Message received for other room (${data.room}), ignoring.`);
            // Có thể thêm thông báo cho các phòng khác ở đây (ví dụ: highlight tên phòng)
        }
    });

    socket.on('loadHistory', (messages) => {
        console.log(`Loading history for room ${currentRoom}:`, messages);
        messagesContainer.innerHTML = ''; // Xóa loading/joining message
        if (messages.length === 0) {
            displaySystemMessage("No messages in this room yet. Start chatting!");
        } else {
            messages.forEach(msg => {
                displayMessage(msg.username, msg.text, new Date(msg.createdAt));
            });
             displaySystemMessage("--- Loaded recent messages ---");
        }
        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.placeholder = "Enter message...";
        messageInput.focus();
        scrollToBottom(true); // Cuộn xuống cuối không cần hiệu ứng
    });

    socket.on('userJoined', (data) => {
         if (data.username && currentRoom) {
            displaySystemMessage(`${data.username} has joined the room.`);
        }
    });

    socket.on('userLeft', (data) => {
         if (data.username && currentRoom) {
            displaySystemMessage(`${data.username} has left the room.`);
        }
    });

    socket.on('chatError', (error) => {
        console.error("Chat Error from server:", error.message);
        errorMessage.textContent = error.message;
    });


    // --- Utility Functions ---

    // Hàm hiển thị tin nhắn thông thường
    function displayMessage(senderUsername, messageText, timestamp) {
        const messageContainerElement = document.createElement('div');
        messageContainerElement.classList.add('message-container');

        const messageElement = document.createElement('div');
        messageElement.classList.add('message');

        // **Thêm class nếu là tin nhắn của user hiện tại**
        if (senderUsername === username) {
            messageContainerElement.classList.add('my-message-container');
        }

        const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Username (có thể ẩn nếu muốn)
        // const usernameSpan = document.createElement('span');
        // usernameSpan.className = 'username';
        // usernameSpan.textContent = senderUsername;
        // messageElement.appendChild(usernameSpan);

        // Message Text
        const textSpan = document.createElement('span');
        textSpan.className = 'text';
        textSpan.textContent = messageText; // Dùng textContent để an toàn
        messageElement.appendChild(textSpan);

        // Timestamp
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.textContent = timeString;
        messageElement.appendChild(timestampSpan);

        // Gắn bubble vào container
        messageContainerElement.appendChild(messageElement);
        // Gắn container vào khung chat
        messagesContainer.appendChild(messageContainerElement);

        scrollToBottom(); // Cuộn xuống dưới cùng
    }

    // Hàm hiển thị tin nhắn hệ thống (join/left/info)
    function displaySystemMessage(message) {
        const systemMsgElement = document.createElement('p');
        systemMsgElement.classList.add('system-message');
        systemMsgElement.textContent = message;
        messagesContainer.appendChild(systemMsgElement);
        scrollToBottom();
    }


    // Hàm cuộn xuống dưới cùng của khung chat
    function scrollToBottom(instant = false) {
        if (instant) {
             messagesContainer.scrollTop = messagesContainer.scrollHeight;
        } else {
             messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: 'smooth' // Cuộn mượt
             });
        }
    }

    // --- Logout ---
    logoutBtn.addEventListener('click', () => {
        console.log('Logging out...');
        localStorage.removeItem('chatUsername');
        localStorage.removeItem('chatUserId');
        // localStorage.removeItem('lastChatRoom'); // Xóa phòng cuối cùng nếu có lưu
        socket.disconnect();
        window.location.href = '/login.html'; // Chuyển về trang login
    });

}); // End DOMContentLoaded