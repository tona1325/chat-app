// client.js
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

// --- Authentication Check ---
if (!username || !userId) {
    // Nếu không có thông tin user, quay lại trang login
    window.location.href = '/login.html';
} else {
    displayUsername.textContent = username; // Hiển thị username
}

// --- Room Handling ---

// Hàm để tham gia phòng chat
function joinRoom(roomName) {
     errorMessage.textContent = ''; // Clear error
    if (currentRoom === roomName) return; // Đã ở trong phòng này rồi

    // Rời phòng cũ (nếu có)
    if (currentRoom) {
        socket.emit('leaveRoom', currentRoom);
        console.log(`Leaving room: ${currentRoom}`);
    }

    console.log(`Attempting to join room: ${roomName}`);
    currentRoom = roomName;
    messagesContainer.innerHTML = '<em>Loading history...</em>'; // Xóa tin nhắn cũ, hiển thị loading
    messageInput.disabled = true;
    sendButton.disabled = true;

    // Gửi sự kiện joinRoom lên server
    socket.emit('joinRoom', { username, userId, room: roomName });

    // Cập nhật UI
    currentRoomTitle.textContent = `Room: ${roomName}`;
     document.querySelectorAll('#room-list li').forEach(li => {
        li.classList.remove('active');
        if(li.getAttribute('data-room') === roomName) {
            li.classList.add('active');
        }
    });
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
createRoomBtn.addEventListener('click', () => {
    const newRoom = newRoomNameInput.value.trim().toLowerCase().replace(/\s+/g, '-'); // Chuẩn hóa tên phòng
    if (newRoom) {
        // Kiểm tra xem phòng đã tồn tại trong list chưa
        let roomExists = false;
        document.querySelectorAll('#room-list li').forEach(li => {
            if (li.getAttribute('data-room') === newRoom) {
                roomExists = true;
            }
        });

        // Nếu chưa tồn tại, thêm vào list
        if (!roomExists) {
            const newRoomLi = document.createElement('li');
            newRoomLi.setAttribute('data-room', newRoom);
            newRoomLi.textContent = newRoomNameInput.value.trim(); // Giữ tên gốc để hiển thị
            roomList.appendChild(newRoomLi);
        }

        // Tham gia phòng mới (hoặc phòng đã có)
        joinRoom(newRoom);
        newRoomNameInput.value = ''; // Clear input
    }
});

 newRoomNameInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        createRoomBtn.click();
    }
});

// --- Message Handling ---

// Hàm gửi tin nhắn
function sendMessage() {
    const messageText = messageInput.value.trim();
    errorMessage.textContent = ''; // Clear error

    if (messageText && currentRoom) {
        socket.emit('sendMessage', { message: messageText, room: currentRoom });
        messageInput.value = ''; // Xóa input sau khi gửi
    } else if (!currentRoom) {
        errorMessage.textContent = 'Please select or create a room first.';
    }
}

// Gửi tin nhắn khi nhấn nút Send
sendButton.addEventListener('click', sendMessage);

// Gửi tin nhắn khi nhấn Enter trong input
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// --- Socket Event Listeners ---

// Lắng nghe sự kiện 'connect' (tùy chọn, để biết đã kết nối thành công)
socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
    // Nếu đang ở trong 1 phòng nào đó khi reconnect, có thể cần rejoin
    // if (currentRoom) {
    //     joinRoom(currentRoom); // Rejoin logic có thể cần phức tạp hơn
    // }
});

 // Lắng nghe sự kiện 'disconnect'
socket.on('disconnect', (reason) => {
    console.log('Disconnected from server:', reason);
    messagesContainer.innerHTML += `<p><em>Connection lost. Attempting to reconnect...</em></p>`;
    messageInput.disabled = true;
    sendButton.disabled = true;
    currentRoomTitle.textContent = "Disconnected";
     // Có thể thêm logic thông báo hoặc cố gắng kết nối lại ở đây
});

// Lắng nghe khi vào phòng thành công
socket.on('joinedRoom', ({ room }) => {
    console.log(`Successfully joined room: ${room}`);
    messageInput.disabled = false; // Enable input khi đã vào phòng
    sendButton.disabled = false;
    messageInput.focus();
});


// Lắng nghe tin nhắn mới từ server
socket.on('newMessage', (data) => {
     // Chỉ hiển thị tin nhắn nếu nó thuộc về phòng hiện tại
    if(data.room === currentRoom) {
        displayMessage(data.username, data.text, new Date(data.createdAt));
    }
});

// Lắng nghe lịch sử chat khi vào phòng
socket.on('loadHistory', (messages) => {
    messagesContainer.innerHTML = ''; // Xóa thông báo loading
    messages.forEach(msg => {
        displayMessage(msg.username, msg.text, new Date(msg.createdAt));
    });
     messageInput.disabled = false; // Enable input sau khi load xong history
     sendButton.disabled = false;
});

// Lắng nghe khi có user khác vào phòng
socket.on('userJoined', (data) => {
     if (data.username && currentRoom) { // Đảm bảo đang ở trong phòng
        const joinMsg = document.createElement('p');
        joinMsg.classList.add('system-message');
        joinMsg.textContent = `${data.username} has joined the room.`;
        messagesContainer.appendChild(joinMsg);
        scrollToBottom();
    }
});

// Lắng nghe khi có user khác rời phòng
socket.on('userLeft', (data) => {
     if (data.username && currentRoom) { // Đảm bảo đang ở trong phòng
        const leftMsg = document.createElement('p');
        leftMsg.classList.add('system-message');
        leftMsg.textContent = `${data.username} has left the room.`;
        messagesContainer.appendChild(leftMsg);
        scrollToBottom();
    }
});

 // Lắng nghe lỗi từ server
socket.on('chatError', (error) => {
    console.error("Chat Error:", error.message);
    errorMessage.textContent = error.message;
});


// --- Utility Functions ---

// Hàm hiển thị tin nhắn trên UI
function displayMessage(senderUsername, messageText, timestamp) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    if (senderUsername === username) {
        messageElement.classList.add('my-message'); // Đánh dấu tin nhắn của mình
    }

    const timeString = timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    messageElement.innerHTML = `
        <span class="username">${senderUsername}</span>
        <span class="text">${escapeHTML(messageText)}</span>
        <span class="timestamp">${timeString}</span>
    `;
    messagesContainer.appendChild(messageElement);
    scrollToBottom(); // Cuộn xuống dưới cùng khi có tin nhắn mới
}

// Hàm cuộn xuống dưới cùng của khung chat
function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Hàm escape HTML để tránh XSS
function escapeHTML(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
}


// --- Logout ---
logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('chatUsername');
    localStorage.removeItem('chatUserId');
    socket.disconnect(); // Ngắt kết nối socket
    window.location.href = '/login.html';
});