import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { User } from '../models/User';
import { hashPassword } from '../utils/password';
import { UserRole } from '../types';
import { connectDB } from '../config/database';

dotenv.config();

const createAdmin = async () => {
  try {
    await connectDB();

    const email = process.argv[2] || 'admin@negotify.com';
    const password = process.argv[3] || 'admin123456';
    const name = process.argv[4] || 'מנהל מערכת';

    // Check if admin exists
    const existingAdmin = await User.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      console.log('❌ Admin user already exists');
      process.exit(1);
    }

    // Create admin
    const hashedPassword = await hashPassword(password);
    const admin = await User.create({
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      role: UserRole.ADMIN,
      status: 'active'
    });

    console.log('✅ Admin user created successfully!');
    console.log(`📧 Email: ${admin.email}`);
    console.log(`👤 Name: ${admin.name}`);
    console.log(`🔑 Password: ${password}`);
    console.log('\n⚠️  Please change the password after first login!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  }
};

createAdmin();

