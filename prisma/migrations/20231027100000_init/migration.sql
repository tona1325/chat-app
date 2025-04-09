-- CreateTable
CREATE TABLE "public.User" (
    "id" SERIAL NOT NULL, -- SERIAL là kiểu PostgreSQL cho integer tự tăng và làm khóa chính
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, -- TIMESTAMP(3) để có độ chính xác mili giây giống DateTime của Prisma

    CONSTRAINT "User_pkey" PRIMARY KEY ("id") -- Khai báo khóa chính tường minh
);


CREATE TABLE "User" (
    "id" SERIAL NOT NULL, -- SERIAL là kiểu PostgreSQL cho integer tự tăng và làm khóa chính
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, -- TIMESTAMP(3) để có độ chính xác mili giây giống DateTime của Prisma

    CONSTRAINT "User_pkey" PRIMARY KEY ("id") -- Khai báo khóa chính tường minh
);

-- CreateTable
CREATE TABLE "Message" (
    "id" SERIAL NOT NULL,
    "text" TEXT NOT NULL,
    "room" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL, -- Kiểu dữ liệu phải khớp với User.id

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username"); -- Tạo ràng buộc UNIQUE cho username

-- CreateIndex
CREATE INDEX "Message_room_createdAt_idx" ON "Message"("room", "createdAt"); -- Tạo index để tăng tốc query theo room và thời gian

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Thêm khóa ngoại liên kết Message.userId với User.id
-- ON DELETE RESTRICT: Ngăn xóa User nếu họ còn Message
-- ON UPDATE CASCADE: Nếu User.id thay đổi (hiếm khi xảy ra với SERIAL), cập nhật luôn userId trong Message