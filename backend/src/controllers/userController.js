import { createUser, deleteUser, getUserById, listUsers, updateUser, updateUserAdmin } from "../services/userService.js";

export function listUsersController(_req, res) {
  res.json({ users: listUsers() });
}

export async function createUserController(req, res, next) {
  try {
    const user = await createUser(req.body || {});
    res.status(201).json({ user, users: listUsers() });
  } catch (error) {
    next(error);
  }
}

export function updateUserController(req, res, next) {
  try {
    const user = updateUser(req.params.id, req.body || {});
    res.json({ user, users: listUsers() });
  } catch (error) {
    next(error);
  }
}

export function updateUserAdminController(req, res, next) {
  try {
    const user = updateUserAdmin(req.params.id, Boolean(req.body?.isAdmin));
    res.json({ user, users: listUsers() });
  } catch (error) {
    next(error);
  }
}

export function deleteUserController(req, res, next) {
  try {
    deleteUser(req.params.id);
    res.json({ users: listUsers() });
  } catch (error) {
    next(error);
  }
}

export function profileController(req, res) {
  res.json({ user: getUserById(req.user.id) });
}

