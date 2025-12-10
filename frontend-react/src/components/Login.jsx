// frontend-react/src/components/Login.jsx
import React, { useState } from "react";
import "./Login.css";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const handleLogin = () => {
    const users = {
      admin:   { pass: "admin123", role: "admin" },
      baove:   { pass: "123456",   role: "operator" },
      guest:   { pass: "123456",   role: "viewer" }
    };

    if (users[username] && users[username].pass === password) {
      localStorage.setItem("username", username);
      localStorage.setItem("role", users[username].role);
      onLogin(users[username].role);
    } else {
      alert("Sai tên đăng nhập hoặc mật khẩu!");
    }
  };

  return (
    <div className="login-container">
      {/* Optional: <div className="particles"></div> {/* bạn có thể thêm hiệu ứng sau */}

      <div className="login-card">
        <h1 className="login-title">LOGIN</h1>
        <p className="login-subtitle">Hệ thống nhận diện biển số thông minh</p>

        <div className="input-group">
          <input
            type="text"
            placeholder="Tên đăng nhập"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input-field"
          />
        </div>

        <div className="input-group">
          <input
            type="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field"
          />
        </div>

        <button onClick={handleLogin} className="login-btn">
          ĐĂNG NHẬP
        </button>

        <div className="hint">
          <p><strong>admin</strong> / admin123 → <strong>Quản trị viên</strong></p>
          <p><strong>baove</strong> / 123456 → <strong>Bảo vệ</strong></p>
          <p><strong>guest</strong> / 123456 → <strong>Khách xem</strong></p>
        </div>
      </div>
    </div>
  );
}