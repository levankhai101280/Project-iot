// frontend-react/src/App.jsx
import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation
} from "react-router-dom";
import io from "socket.io-client";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import History from "./components/History";

// Kết nối socket 1 lần duy nhất
const socket = io("http://localhost:5000", {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

// Component bảo vệ route (chỉ admin mới vào được History)
function ProtectedRoute({ children, requiredRole = "admin" }) {
  const role = localStorage.getItem("role");
  const location = useLocation();

  if (!role) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && role !== requiredRole) {
    return <Navigate to="/" replace />;
  }

  return children;
}

// Loading screen đẹp khi đang kết nối
function LoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #0f2027, #203a43)",
      display: "grid",
      placeItems: "center",
      color: "#00e5ff",
      fontSize: "28px",
      fontWeight: "bold"
    }}>
      <div>
        <div>Đang tải hệ thống ANPR...</div>
        <div style={{ fontSize: "18px", marginTop: "20px", color: "#81d4fa" }}>
          Vui lòng chờ trong giây lát
        </div>
      </div>
    </div>
  );
}

function App() {
  const [role, setRole] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Kiểm tra đã login chưa
    const savedRole = localStorage.getItem("role");
    if (savedRole) {
      setRole(savedRole);
    }
    setIsLoading(false);
  }, []);

  const handleLogin = (newRole) => {
    setRole(newRole);
    localStorage.setItem("role", newRole);
    // Đổi URL về trang chủ ngay lập tức
    window.location.href = "/";
  };

  const handleLogout = () => {
    localStorage.clear();
    setRole(null);
    window.location.href = "/login";
  };

  // Hiển thị loading lúc đầu
  if (isLoading) {
    return <LoadingScreen />;
  }

  // Nếu chưa login → vào trang login
  if (!role) {
    return <Login onLogin={handleLogin} />;
  }

  // Đã login → vào hệ thống
  return (
    <Router>
      {/* Truyền socket và logout function xuống Dashboard */}
      <Routes>
        <Route
          path="/"
          element={<Dashboard role={role} socket={socket} onLogout={handleLogout} />}
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute requiredRole="admin">
              <History />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;