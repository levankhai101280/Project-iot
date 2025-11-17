import cv2
import base64
import threading
from ultralytics import YOLO
from flask import Flask
from flask_socketio import SocketIO

ESP_STREAM = "http://192.168.1.11/stream"  # IP ESP32-CAM

app = Flask(__name__)
socketio = SocketIO(app, cors_allowed_origins="*")

model = YOLO("yolov8n.pt")

vehicle_classes = {"car","truck","bus","motorcycle","bicycle"}
person_class = "person"

def detection_loop():
    cap = cv2.VideoCapture(ESP_STREAM)
    if not cap.isOpened():
        print("Không mở được stream ESP32")
        return

    while True:
        ret, frame = cap.read()
        if not ret:
            continue

        # Tắt log YOLO verbose
        results = model(frame, verbose=False)[0]
        counts = {}
        detected = False

        for r in results.boxes:
            cls_id = int(r.cls[0])
            conf = float(r.conf[0])
            label = model.names[cls_id]

            if label in vehicle_classes.union({person_class}) and conf > 0.3:
                detected = True
                x1, y1, x2, y2 = map(int, r.xyxy[0])
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(frame, f"{label} {conf:.2f}",
                            (x1, y1-5), cv2.FONT_HERSHEY_SIMPLEX,
                            0.6, (0, 255, 0), 2)
                counts[label] = counts.get(label, 0) + 1

        # Chỉ in khi phát hiện
        if detected:
            print(f"Phát hiện: {counts}")

        _, jpeg = cv2.imencode('.jpg', frame)
        jpg_b64 = base64.b64encode(jpeg).decode('utf-8')
        socketio.emit("frame", {"frame": jpg_b64, "counts": counts})

        socketio.sleep(0.03)

@socketio.on("connect")
def connected():
    print("Client connected")

if __name__ == "__main__":
    t = threading.Thread(target=detection_loop, daemon=True)
    t.start()
    socketio.run(app, host="0.0.0.0", port=5000)
