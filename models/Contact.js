// backend/models/Contact.js
import mongoose from "mongoose";

const ContactSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, trim: true },
  phone: { type: String, trim: true },
  message: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

const Contact = mongoose.models?.Contact || mongoose.model("Contact", ContactSchema);

export default Contact;
