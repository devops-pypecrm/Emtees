const url = "https://gecouncil.com/api/trpc";

async function run() {
  // 1. Create a student via registerStudentWithReferral
  const regPayload = {
    name: "Test Student",
    phone: "1234567890",
    username: "teststu123",
    password: "password123",
    courseId: 1, // assuming 1 is active
    preferredClassTime: "Morning",
    referralCode: "AM33",
    paymentOption: "full_payment"
  };

  const regRes = await fetch(`${url}/salesExecutive.registerStudentWithReferral`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(regPayload)
  });
  console.log("Register response:", await regRes.text());

  // 2. Try to login
  const loginPayload = {
    username: "teststu123",
    password: "password123"
  };
  const loginRes = await fetch(`${url}/auth.login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loginPayload)
  });
  console.log("Login response:", await loginRes.text());
}

run();
