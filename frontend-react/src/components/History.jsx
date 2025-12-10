// frontend-react/src/components/History.jsx
import React, { useState, useEffect } from "react";
import "./History.css";

export default function History() {
  const [records, setRecords] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editPlate, setEditPlate] = useState("");
  const [toast, setToast] = useState(null);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    loadRecords();
    const interval = setInterval(loadRecords, 10000); // 10 giây thay vì DB đang xử lý nhiều
    return () => clearInterval(interval);
    }, []);

  const loadRecords = () => {
    fetch("http://localhost:5000/api/records")
      .then(res => res.json())
      .then(data => setRecords(data))
      .catch(err => {
        console.error(err);
        showToast("Lỗi tải dữ liệu", "error");
      });
  };

  const handleDelete = (id) => {
  if (!window.confirm("Xóa bản ghi này vĩnh viễn?")) return;

  showToast("Đang xóa...", "success");

  fetch(`http://localhost:5000/api/records/${id}`, { 
    method: "DELETE",
    headers: { "Cache-Control": "no-cache" }
  })
    .then(res => res.json())
    .then(result => {
      if (result.success) {
        showToast("Đã xóa thành công!", "success");
        // Delay 500ms rồi mới reload → tránh xung đột DB
        setTimeout(loadRecords, 500);
      } else {
        showToast(result.message || "Xóa thất bại", "error");
      }
    })
    .catch(err => {
      console.error("Delete error:", err);
      showToast("Lỗi kết nối khi xóa", "error");
      // Thử reload lại sau 1 giây nếu lỗi mạng
      setTimeout(loadRecords, 1000);
    });
};

  const startEdit = (record) => {
    setEditingId(record.id);
    setEditPlate(record.plate_number || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditPlate("");
  };

  const saveEdit = (id) => {
    const newPlate = editPlate.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '');
    if (!newPlate || newPlate.length < 5) {
      showToast("Biển số không hợp lệ!", "error");
      return;
    }

    fetch(`http://localhost:5000/api/records/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate_number: newPlate })
    })
      .then(res => {
        if (!res.ok) throw new Error("Server error");
        return res.json();
      })
      .then(result => {
        if (result.success) {
          showToast("Cập nhật thành công!", "success");
          setEditingId(null);
          loadRecords();
        }
      })
      .catch(() => showToast("Cập nhật thất bại", "error"));
  };

  const getPlateDisplay = (plate) => {
    if (!plate || plate === "N/A" || plate === "Chưa nhận dạng") {
      return <span style={{ color: "#ff9800", fontStyle: "italic" }}>Chưa nhận dạng</span>;
    }
    return <span className="plate-number">{plate}</span>;
  };

  return (
    <div className="history-container">
      {/* TOAST THÔNG BÁO */}
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.message}
        </div>
      )}

      {/* HEADER */}
      <div className="history-header">
        <button className="back-btn" onClick={() => window.location.href = "/"}>
          Back to Dashboard
        </button>
        <h1 className="title">LỊCH SỬ PHƯƠNG TIỆN ĐÃ QUA</h1>
        <div style={{ width: 200 }}></div>
      </div>

      {/* NẾU CHƯA CÓ DỮ LIỆU */}
      {records.length === 0 ? (
        <div className="empty-state">
          <p>Chưa có phương tiện nào được ghi nhận</p>
          <small>Hệ thống sẽ lưu tất cả xe đi qua, kể cả chưa đọc được biển số</small>
        </div>
      ) : (
        <div className="table-container">
          <table className="history-table">
            <thead>
              <tr>
                <th>ID Xe</th>
                <th>Biển số</th>
                <th>Loại xe</th>
                <th>Hướng</th>
                <th>Thời gian phát hiện</th>
                <th>Ảnh toàn cảnh</th>
                <th>Ảnh biển số</th>
                <th width="180">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id}>
                  <td><strong>#{r.track_id}</strong></td>

                  <td>
                    {editingId === r.id ? (
                      <input
                        type="text"
                        value={editPlate}
                        onChange={(e) => setEditPlate(e.target.value)}
                        className="edit-input"
                        autoFocus
                        placeholder="Nhập biển số..."
                      />
                    ) : (
                      getPlateDisplay(r.plate_number)
                    )}
                  </td>

                  <td>{r.vehicle_type || "Không xác định"}</td>

                  <td>
                    <span className={`direction-badge ${r.direction === "up" ? "direction-up" : "direction-down"}`}>
                      {r.direction === "up" ? "VÀO" : "RA"}
                    </span>
                  </td>

                  <td style={{ fontSize: "15px", color: "#81d4fa" }}>
                    {new Date(r.detected_at).toLocaleString("vi-VN", {
                      weekday: "short",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit"
                    })}
                  </td>

                  <td>
                    <img
                      src={`http://localhost:5000/${r.full_image_path}`}
                      alt="Toàn cảnh"
                      className="vehicle-img"
                    />
                  </td>

                  <td>
                    <img
                      src={`http://localhost:5000/${r.plate_image_path}`}
                      alt="Biển số"
                      className="plate-img"
                    />
                  </td>

                  <td>
                    {editingId === r.id ? (
                      <>
                        <button className="action-btn save-btn" onClick={() => saveEdit(r.id)}>
                          Save
                        </button>
                        <button className="action-btn cancel-btn" onClick={cancelEdit}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button className="action-btn edit-btn" onClick={() => startEdit(r)}>
                          Edit
                        </button>
                        <button className="action-btn delete-btn" onClick={() => handleDelete(r.id)}>
                          Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}