-- AlterTable: add passwordPlain to User (visible for admin)
ALTER TABLE "User" ADD COLUMN "passwordPlain" TEXT;
