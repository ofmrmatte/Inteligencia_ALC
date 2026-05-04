import "../../config/database.js";
import { createUser, getPrivateUserByEmail } from "../../services/userService.js";

const admin = {
  name: "Administrador",
  email: "admin@empresa.com",
  password: "admin123",
  role: "admin",
  isAdmin: true,
};

async function seedAdmin() {
  const existing = getPrivateUserByEmail(admin.email);
  if (existing) {
    console.log("Usuário admin inicial já existe.");
    return;
  }

  await createUser(admin);
  console.log("Usuário admin inicial criado: admin@empresa.com / admin123");
}

seedAdmin().catch((error) => {
  console.error(error);
  process.exit(1);
});

