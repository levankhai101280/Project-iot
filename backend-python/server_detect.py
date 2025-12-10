# backend-python/server.py
import cv2
import base64
import threading
import numpy as np
from ultralytics import YOLO
from flask import Flask, send_from_directory, jsonify, request  # ← THÊM , request
from flask_socketio import SocketIO
from flask_cors import CORS
import easyocr
import queue
import pymysql.cursors
from datetime import datetime
import os
import re

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# ================== CẤU HÌNH ==================
model = YOLO("yolov8n.pt")
lp_model = YOLO("yolov8_koushim_lp.pt")
reader = easyocr.Reader(['en'], gpu=True)

connection = pymysql.connect(
    host='localhost', user='root', password='',
    database='traffic_system', cursorclass=pymysql.cursors.DictCursor,
    autocommit=True
)

vehicle_classes = {"car", "truck", "bus", "motorcycle", "bicycle"}
track_history = {}
cross_counts = {"up": 0, "down": 0}
current_conf_threshold = 0.3
TRIPWIRE_Y = None
LPR_QUEUE = queue.Queue(maxsize=30)
PLATE_RESULTS = {}
SAVED_TRACKS = set()


# ================== API LỊCH SỬ ==================
@app.route("/api/records")
def api_records():
    with connection.cursor() as cur:
        cur.execute("SELECT * FROM vehicle_records ORDER BY detected_at DESC LIMIT 100")
        rows = cur.fetchall()
    return jsonify(rows)


# ================== OCR BIỂN SỐ ==================
def recognize_license_plate(cropped_image):
    if cropped_image is None or cropped_image.size == 0:
        return "N/A"
    if cropped_image.shape[0] < 15 or cropped_image.shape[1] < 40:
        return "N/A"
    
    gray = cv2.cvtColor(cropped_image, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
    enhanced = clahe.apply(gray)
    denoised = cv2.medianBlur(enhanced, 3)
    
    results = reader.readtext(denoised, allowlist='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ.-', detail=0)
    if not results:
        return "N/A"
    
    plate = "".join(results).replace(" ", "").upper()
    plate = re.sub(r'\.+', '.', plate)
    plate = re.sub(r'^\.+|\.+$', '', plate)
    cleaned = re.sub(r'[^A-Z0-9.]', '', plate)
    
    if 6 <= len(cleaned.replace(".", "")) <= 10:  # biển Việt Nam thường 7-9 ký tự
        return cleaned
    return "N/A"


def lpr_worker():
    while True:
        key, cropped_img = LPR_QUEUE.get()
        plate = recognize_license_plate(cropped_img)
        if plate != "N/A":
            PLATE_RESULTS[key] = plate
        LPR_QUEUE.task_done()


# ================== LƯU RECORD AN TOÀN 100% ==================
def save_record(tid, plate, vtype, direction, plate_crop, full_frame):
    if tid in SAVED_TRACKS:
        return

    # CHỈ LƯU KHI CÓ BIỂN SỐ THẬT HOẶC "Không đọc được"
    if plate in ["Đang nhận dạng...", "Chưa nhận dạng", "N/A"]:
        return  # BỎ QUA – KHÔNG LƯU RÁC

    today = datetime.now().strftime("%Y-%m-%d")
    os.makedirs(f"images/full/{today}", exist_ok=True)
    os.makedirs(f"images/plate/{today}", exist_ok=True)
    
    timestamp = int(datetime.now().timestamp())
    full_path = f"images/full/{today}/{tid}_{timestamp}.jpg"
    plate_path = f"images/plate/{today}/{tid}_{timestamp}.jpg"
    
    cv2.imwrite(full_path, full_frame)
    cv2.imwrite(plate_path, plate_crop)

    try:
        with connection.cursor() as cur:
            sql = """INSERT INTO vehicle_records 
                    (track_id, plate_number, vehicle_type, direction, full_image_path, plate_image_path)
                    VALUES (%s, %s, %s, %s, %s, %s)"""
            cur.execute(sql, (tid, plate, vtype, direction, full_path, plate_path))
        SAVED_TRACKS.add(tid)
        print(f"[ĐÃ LƯU] Xe {tid} | Biển: {plate} | Loại: {vtype}")
    except Exception as e:
        print(f"[DB ERROR] {e}")


# ================== VÒNG LẶP DETECTION ==================
# ================== VÒNG LẶP DETECTION – PHIÊN BẢN HOÀN HẢO NHẤT (LƯU TẤT CẢ XE) ==================
# ================== VÒNG LẶP DETECTION – CHỈ LƯU KHI CÓ BIỂN SỐ (CHUẨN NHẤT CHO ĐỒ ÁN) ==================
# ================== VÒNG LẶP DETECTION – HIỆN REALTIME + CHỈ LƯU KHI CÓ BIỂN SỐ ==================
def detection_loop():
    cap = cv2.VideoCapture(0)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    global TRIPWIRE_Y
    TRIPWIRE_Y = int(height * 0.75)

    while True:
        ret, frame = cap.read()
        if not ret:
            continue

        results = model.track(frame, persist=True, verbose=False, classes=[2,3,5,7])[0]
        track_ids = results.boxes.id.int().cpu().tolist() if results.boxes.id is not None else []
        vehicle_boxes = {}

        # Danh sách xe hiện tại (để gửi realtime)
        current_vehicles = []

        cv2.line(frame, (0, TRIPWIRE_Y), (width, TRIPWIRE_Y), (0, 255, 255), 3)

        for i, box in enumerate(results.boxes):
            cls = int(box.cls[0])
            conf = box.conf[0]
            if conf < current_conf_threshold:
                continue

            x1, y1, x2, y2 = map(int, box.xyxy[0])
            tid = track_ids[i] if i < len(track_ids) else -1
            cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

            vehicle_boxes[tid] = [x1, y1, x2, y2]
            track_history[tid] = (cx, cy)

            # ĐẾM XE QUA VẠCH
            if tid in track_history:
                prev_y = track_history[tid][1]
                if prev_y > TRIPWIRE_Y >= cy:
                    cross_counts["down"] += 1
                elif prev_y <= TRIPWIRE_Y < cy:
                    cross_counts["up"] += 1

            # Vẽ khung xe
            vtype = model.names[cls]
            color = (0, 255, 0) if vtype in ["car", "truck", "bus"] else (255, 150, 0)
            cv2.rectangle(frame, (x1, y1), (x2, y2), color, 3)
            cv2.putText(frame, f"{vtype} {tid}", (x1, y1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)

            # Thêm vào danh sách realtime
            key = f"LP_{tid}"
            plate_text = PLATE_RESULTS.get(key, "Đang nhận dạng...")
            current_vehicles.append({
                "id": tid,
                "type": vtype,
                "plate": plate_text
            })

        # === NHẬN DIỆN BIỂN SỐ ===
        lp_results = lp_model(frame, conf=0.25, iou=0.45)[0]
        for lp_box in lp_results.boxes:
            px1, py1, px2, py2 = map(int, lp_box.xyxy[0])
            plate_crop = frame[py1:py2, px1:px2]
            if plate_crop.size == 0 or plate_crop.shape[0] < 30 or plate_crop.shape[1] < 80:
                continue

            matched_tid = None
            for tid, vbox in vehicle_boxes.items():
                if (vbox[0] < px1 < px2 < vbox[2] and vbox[1] < py1 < py2 < vbox[3]):
                    matched_tid = tid
                    break
            if not matched_tid:
                continue

            key = f"LP_{matched_tid}"
            if key not in PLATE_RESULTS:
                LPR_QUEUE.put((key, plate_crop.copy()))

            # Hiển thị trên video
            display_text = PLATE_RESULTS.get(key, "Đang nhận dạng...")
            color = (0, 255, 255) if "Đang nhận dạng" in display_text else (0, 255, 0)
            cv2.putText(frame, display_text, (px1, py1-10), cv2.FONT_HERSHEY_SIMPLEX, 0.9, color, 2)
            cv2.rectangle(frame, (px1, py1), (px2, py2), (255, 255, 0), 3)

            # CHỈ LƯU KHI ĐÃ CÓ BIỂN SỐ THẬT
            if key in PLATE_RESULTS and matched_tid not in SAVED_TRACKS:
                plate_text = PLATE_RESULTS[key]
                if plate_text != "N/A":
                    vtype = "unknown"
                    for b in results.boxes:
                        if b.id is not None and int(b.id) == matched_tid:
                            vtype = model.names[int(b.cls[0])]
                            break
                    direction = "up" if track_history.get(matched_tid, (0,10000))[1] > TRIPWIRE_Y else "down"
                    save_record(matched_tid, plate_text, vtype, direction, plate_crop, frame)
                    print(f"[ĐÃ LƯU] Xe {matched_tid} → {plate_text}")

        # GỬI DỮ LIỆU REALTIME
        _, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        b64 = base64.b64encode(buffer).decode()
        socketio.emit("frame", {
            "frame": b64,
            "counts": cross_counts,
            "current_vehicles": current_vehicles,  # ← DANH SÁCH XE REALTIME
            "plates": dict(list(PLATE_RESULTS.items())[-10:])
        })
        socketio.sleep(0.03)


# ================== SOCKET EVENTS ==================
@socketio.on("update_conf_threshold")
def update_conf(data):
    global current_conf_threshold
    current_conf_threshold = float(data["threshold"])

@socketio.on("reset_counter")
def reset_counter():
    global cross_counts
    cross_counts = {"up": 0, "down": 0}


# ================== PHỤC VỤ ẢNH ==================
@app.route('/images/<path:filename>')
def serve_image(filename):
    return send_from_directory(os.getcwd(), f"images/{filename}", as_attachment=False)

# ================== API SỬA BIỂN SỐ ==================
@app.route("/api/records/<int:record_id>", methods=["PUT"])
def update_record(record_id):
    try:
        data = request.get_json()
        if not data or "plate_number" not in data:
            return jsonify({"success": False, "message": "Thiếu dữ liệu plate_number"}), 400

        new_plate = data["plate_number"].strip().upper()
        if len(new_plate.replace(".", "").replace("-", "")) < 5:
            new_plate = "N/A"

        with connection.cursor() as cur:
            cur.execute(
                "UPDATE vehicle_records SET plate_number = %s WHERE id = %s",
                (new_plate, record_id)
            )
            if cur.rowcount == 0:
                return jsonify({"success": False, "message": "Không tìm thấy bản ghi ID " + str(record_id)}), 404

        connection.commit()  # QUAN TRỌNG: phải commit thì mới lưu vào DB!
        print(f"[OK] Đã sửa biển số ID {record_id} → {new_plate}")
        return jsonify({"success": True, "plate_number": new_plate})

    except Exception as e:
        print(f"[ERROR] PUT /api/records/{record_id}: {e}")
        return jsonify({"success": False, "message": "Lỗi server"}), 500


# ================== API XÓA BẢN GHI ==================
@app.route("/api/records/<int:record_id>", methods=["DELETE"])
def delete_record(record_id):
    try:
        with connection.cursor() as cur:
            cur.execute("SELECT plate_number FROM vehicle_records WHERE id = %s", (record_id,))
            record = cur.fetchone()
            if not record:
                return jsonify({"success": False, "message": "Không tìm thấy bản ghi"}), 404

            cur.execute("DELETE FROM vehicle_records WHERE id = %s", (record_id,))
        
        connection.commit()  # QUAN TRỌNG: phải commit!
        print(f"[OK] Đã xóa bản ghi ID {record_id} - Biển: {record['plate_number']}")
        return jsonify({"success": True})

    except Exception as e:
        print(f"[ERROR] DELETE /api/records/{record_id}: {e}")
        return jsonify({"success": False, "message": "Lỗi server"}), 500

# ================== KHỞI ĐỘNG ==================
if __name__ == "__main__":
    threading.Thread(target=lpr_worker, daemon=True).start()
    threading.Thread(target=detection_loop, daemon=True).start()
    print("Server đang chạy tại http://localhost:5000")
    socketio.run(app, host="0.0.0.0", port=5000, debug=False)