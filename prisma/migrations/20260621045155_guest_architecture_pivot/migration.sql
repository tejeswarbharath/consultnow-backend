/*
  Warnings:

  - You are about to drop the column `categoryId` on the `Expert` table. All the data in the column will be lost.
  - You are about to alter the column `pricePerHour` on the `Expert` table. The data in that column could be lost. The data in that column will be cast from `Decimal(65,30)` to `DoublePrecision`.
  - You are about to drop the column `userId` on the `Transaction` table. All the data in the column will be lost.
  - You are about to drop the `Category` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Expert" DROP CONSTRAINT "Expert_categoryId_fkey";

-- AlterTable
ALTER TABLE "Expert" DROP COLUMN "categoryId",
ALTER COLUMN "pricePerHour" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "subjectExpertise" SET NOT NULL,
ALTER COLUMN "subjectExpertise" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "Transaction" DROP COLUMN "userId";

-- DropTable
DROP TABLE "Category";

-- DropTable
DROP TABLE "User";
