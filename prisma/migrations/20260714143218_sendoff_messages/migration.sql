-- CreateTable
CREATE TABLE "sendoff_messages" (
    "id" SERIAL NOT NULL,
    "address" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "signature" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sendoff_messages_pkey" PRIMARY KEY ("id")
);
