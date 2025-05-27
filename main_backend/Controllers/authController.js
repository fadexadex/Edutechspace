import jwt from "jsonwebtoken";
import supabase, { supabaseAdmin } from "../config/supabase.js";
import bcrypt from "bcrypt";
import { AppError } from "../middleware/errorHandler.js";

export const login = async (req, res, next) => {
  try {
    if (!req.body) {
      throw new AppError("Request body is missing", 400);
    }

    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError("Email and password are required", 400);
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw new AppError(error.message, 400);
    }

    const { data: userData, error: dbError } = await supabase
      .from("users")
      .select("id, password")
      .eq("email", email)
      .single();

    if (dbError || !userData) {
      throw new AppError("Invalid credentials", 400);
    }

    const isValid = await bcrypt.compare(password, userData.password);
    if (!isValid) {
      throw new AppError("Invalid credentials", 400);
    }

    const token = jwt.sign({ userId: userData.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    return res.status(200).json({ token });
  } catch (err) {
    next(err);
  }
};

export const signup = async (req, res, next) => {
  try {
    if (!req.body) {
      throw new AppError("Request body is missing", 400);
    }

    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      throw new AppError("Name, email, and password are required", 400);
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name, phone } },
    });

    if (error) {
      throw new AppError(error.message, 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const { error: dbError } = await supabase.from("users").insert(
      {
        id: data.user.id,
        name,
        email,
        phone: phone || null,
        password: hashedPassword,
        ongoingcourses: 0,
        completedcourses: 0,
        picture: null,
      },
      { returning: "representation" }
    );

    if (dbError) {
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
      if (dbError.code == "23505") {
        throw new AppError(
          "An account with the provided email already exists",
          403
        );
      }
      throw new AppError("Failed to save user data: " + dbError.message, 400);
    }

    const token = jwt.sign({ userId: data.user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    return res.status(201).json({ token });
  } catch (err) {
    next(err);
  }
};

export const logout = async (req, res, next) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new AppError(error.message, 400);
    }

    res.status(200).json({ message: "Logged out successfully" });
  } catch (err) {
    next(err);
  }
};

export const generateToken = async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      throw new AppError("User ID is required", 400);
    }

    const { data: user, error } = await supabase
      .from("users")
      .select("id, name, email, picture, ongoingcourses, completedcourses, phone")
      .eq("id", userId)
      .single();
    console.log('generateToken: Supabase query result:', { data: user, error });
    if (error || !user) {
      throw new AppError("User not found", 404);
    }

    const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(200).json({
      ...user,
      token,
    });
  } catch (err) {
    next(err);
  }
};
