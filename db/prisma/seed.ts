/// <reference types="node" />
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create a user
  const user = await prisma.user.create({
    data: {
      name: "Alice",
      email: "alice@example.com",
    },
  });

  // Create a problem
  const problem = await prisma.problem.create({
    data: {
      title: "Add Two Numbers",
      description:
        "Write a function that takes two integers and returns their sum.",
      testCases: [
        { input: "2 3", output: "5" },
        { input: "10 15", output: "25" },
      ],
    },
  });

  // Create a submission
  await prisma.submission.create({
    data: {
      code: "function add(a, b) { return a + b; }",
      language: "JAVASCRIPT",
      status: "PENDING",
      problemId: problem.id,
      userId: user.id,
    },
  });

  console.log("Seed data created!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
