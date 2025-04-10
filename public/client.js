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

    let currentRoom = null; // Phòng chat hiện tại
    let initialLoad = true;

    // --- Authentication Check ---
    if (!username || !userId) {
        console.warn("User not found in localStorage. Redirecting to login.");
        window.location.href = '/login.html';
        return;
    } else {
        console.log(`Logged in as: ${username} (ID: ${userId})`);
        displayUsername.textContent = username;
    }

    // --- Room Handling ---
    function joinRoom(roomName) {
        errorMessage.textContent = '';
        if (currentRoom === roomName && !initialLoad) return;

        if (currentRoom && !initialLoad) {
            socket.emit('leaveRoom', currentRoom);
            console.log(`Leaving room: ${currentRoom}`);
        }

        console.log(`Attempting to join room: ${roomName}`);
        currentRoom = roomName;
        messagesContainer.innerHTML = '';
        displaySystemMessage(`Joining room: ${roomName}...`);
        messageInput.disabled = true;
        sendButton.disabled = true;
        messageInput.placeholder = "Loading messages...";

        socket.emit('joinRoom', { username, userId, room: roomName });

        currentRoomTitle.textContent = `Room: ${roomName}`;
        document.querySelectorAll('#room-list li').forEach(li => {
            li.classList.remove('active');
            if (li.getAttribute('data-room') === roomName) {
                li.classList.add('active');
            }
        });
        initialLoad = false;
    }

    roomList.addEventListener('click', (e) => {
        if (e.target && e.target.tagName === 'LI') {
            const roomToJoin = e.target.getAttribute('data-room');
            if (roomToJoin) {
                joinRoom(roomToJoin);
            }
        }
    });

    function handleCreateAndJoinRoom() {
        const newRoomRaw = newRoomNameInput.value.trim();
        if (newRoomRaw) {
            const newRoomId = newRoomRaw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            if (!newRoomId) {
                errorMessage.textContent = 'Invalid room name (use letters, numbers, hyphens).';
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
                newRoomLi.textContent = newRoomRaw;
                roomList.appendChild(newRoomLi);
            }

            joinRoom(newRoomId);
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
            messageInput.focus();
        } else if (!currentRoom) {
            errorMessage.textContent = 'Please select or create a room first.';
        }
    }

    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // --- Socket Event Listeners ---
    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        errorMessage.textContent = '';
        currentRoomTitle.textContent = "Select a Room";
        messageInput.disabled = true;
        sendButton.disabled = true;
        messageInput.placeholder = "Select a room to start chatting";
        currentRoom = null; // Reset room on reconnect
        initialLoad = true; // Reset initial load flag
        document.querySelectorAll('#room-list li').forEach(li => li.classList.remove('active'));
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        displaySystemMessage(`Disconnected: ${reason}. Attempting to reconnect...`);
        messageInput.disabled = true;
        sendButton.disabled = true;
        currentRoomTitle.textContent = "Disconnected";
        currentRoom = null;
        document.querySelectorAll('#room-list li').forEach(li => li.classList.remove('active'));
    });

    socket.on('joinedRoom', ({ room }) => {
        console.log(`Successfully joined room: ${room}`);
        messagesContainer.innerHTML = ''; // Xóa "Joining..."
        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.placeholder = "Enter message...";
        messageInput.focus();
    });

    socket.on('newMessage', (data) => {
        console.log('Received message:', data);
        if(data.room === currentRoom) {
            displayMessage(data.username, data.text, new Date(data.createdAt));
        } else {
            console.log(`Message received for other room (${data.room}), ignoring.`);
            // Optional: Highlight room name in sidebar
            const roomLi = roomList.querySelector(`li[data-room="${data.room}"]`);
            if (roomLi && !roomLi.classList.contains('active')) {
                roomLi.style.fontWeight = 'bold'; // Highlight rooms with new messages
            }
        }
    });

    socket.on('loadHistory', (messages) => {
        console.log(`Loading history (last 24h) for room ${currentRoom}:`, messages.length);
        messagesContainer.innerHTML = '';
        if (messages.length === 0) {
            displaySystemMessage("No messages in this room in the last 24 hours. Start chatting!");
        } else {
            messages.forEach(msg => {
                displayMessage(msg.username, msg.text, new Date(msg.createdAt));
            });
             displaySystemMessage("--- Loaded messages from last 24 hours ---");
        }
        messageInput.disabled = false;
        sendButton.disabled = false;
        messageInput.placeholder = "Enter message...";
        messageInput.focus();
        scrollToBottom(true);

        // Reset highlight on the current room
        const currentRoomLi = roomList.querySelector(`li[data-room="${currentRoom}"]`);
         if (currentRoomLi) {
             currentRoomLi.style.fontWeight = '600'; // Or original weight if not active
         }

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
    function displayMessage(senderUsername, messageText, timestamp) {
        const messageContainerElement = document.createElement('div');
        messageContainerElement.classList.add('message-container');

        const messageElement = document.createElement('div');
        messageElement.classList.add('message');

        if (senderUsername === username) {
            messageContainerElement.classList.add('my-message-container');
        }

        const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // **Username Span (Đảm bảo được tạo và thêm vào)**
        const usernameSpan = document.createElement('span');
        usernameSpan.className = 'username';
        usernameSpan.textContent = senderUsername;
        messageElement.appendChild(usernameSpan); // Thêm username vào bubble

        // Message Text Span
        const textSpan = document.createElement('span');
        textSpan.className = 'text';
        textSpan.textContent = messageText;
        messageElement.appendChild(textSpan);

        // Timestamp Span
        const timestampSpan = document.createElement('span');
        timestampSpan.className = 'timestamp';
        timestampSpan.textContent = timeString;
        messageElement.appendChild(timestampSpan);

        messageContainerElement.appendChild(messageElement);
        messagesContainer.appendChild(messageContainerElement);

        scrollToBottom();
    }

    function displaySystemMessage(message) {
        const systemMsgElement = document.createElement('p');
        systemMsgElement.classList.add('system-message');
        systemMsgElement.textContent = message;
        messagesContainer.appendChild(systemMsgElement);
        scrollToBottom();
    }

    function scrollToBottom(instant = false) {
        // Chỉ cuộn nếu người dùng đang ở gần cuối
        const scrollThreshold = 100; // Số pixel cách đáy để tự động cuộn
        const shouldScroll = messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < scrollThreshold;

        if (instant || shouldScroll) {
             messagesContainer.scrollTo({
                top: messagesContainer.scrollHeight,
                behavior: instant ? 'instant' : 'smooth'
             });
        }
    }

    // --- Logout ---
    logoutBtn.addEventListener('click', () => {
        console.log('Logging out...');
        localStorage.removeItem('chatUsername');
        localStorage.removeItem('chatUserId');
        socket.disconnect();
        window.location.href = '/login.html';
    });

}); // End DOMContentLoaded