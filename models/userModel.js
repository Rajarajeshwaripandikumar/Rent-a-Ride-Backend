import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    phoneNumber: {
      type: String,
    },

    adress: {
      type: String,
    },

    password: {
      type: String,
      required: true,
    },

    profilePicture: {
      type: String,
      default:
        "https://media.istockphoto.com/id/1316420668/vector/user-icon-human-person-symbol-social-profile-icon-avatar-login-sign-web-user-symbol.jpg?s=612x612&w=612&q=75",
    },

    // Canonical role
    role: {
      type: String,
      enum: ["user", "vendor", "admin"],
      default: "user",
    },

    // Derived flags (not for decision-making)
    isUser: { type: Boolean, default: true },
    isAdmin: { type: Boolean, default: false },
    isVendor: { type: Boolean, default: false },

    // ⚠️ NEW FIELD ADDED HERE — for Employees page
    status: {
      type: String,
      enum: ["active", "inactive", "suspended"],
      default: "active",
    },

    refreshToken: {
      type: String,
      default: "",
    },

    resetPasswordToken: String,
    resetPasswordExpires: Number,
  },
  { timestamps: true }
);

// AUTO-SYNC FLAGS WITH ROLE
userSchema.pre("save", function (next) {
  if (!this.role) this.role = "user";

  this.isUser = this.role === "user";
  this.isVendor = this.role === "vendor";
  this.isAdmin = this.role === "admin";

  next();
});

const User = mongoose.model("User", userSchema);
export default User;
