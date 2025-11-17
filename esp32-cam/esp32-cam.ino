#include "esp_camera.h"
#include <WiFi.h>
#include "camera_pins.h"

const char* ssid = "Jing Ze";
const char* password = "12346789";

// Khởi tạo web server stream MJPEG
#include "esp_http_server.h"

httpd_handle_t stream_httpd = NULL;

// =========================
// Camera server stream
// =========================
esp_err_t stream_handler(httpd_req_t *req){
  camera_fb_t * fb = NULL;
  char buf[256];
  static const char* _STREAM_CONTENT_TYPE = "multipart/x-mixed-replace;boundary=frame";
  static const char* _STREAM_BOUNDARY = "\r\n--frame\r\n";
  static const char* _STREAM_PART = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

  httpd_resp_set_type(req, _STREAM_CONTENT_TYPE);

  while(true){
    fb = esp_camera_fb_get();
    if(!fb) continue;

    size_t hlen = snprintf(buf, sizeof(buf), _STREAM_PART, fb->len);
    if(httpd_resp_send_chunk(req, _STREAM_BOUNDARY, strlen(_STREAM_BOUNDARY)) != ESP_OK) break;
    if(httpd_resp_send_chunk(req, buf, hlen) != ESP_OK) break;
    if(httpd_resp_send_chunk(req, (const char*)fb->buf, fb->len) != ESP_OK) break;

    esp_camera_fb_return(fb);

    delay(50); // giảm FPS → tránh DMA overflow
  }
  return ESP_OK;
}

void startCameraServer(){
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  if(httpd_start(&stream_httpd, &config) == ESP_OK){
    httpd_uri_t stream_uri = {
      .uri       = "/stream",
      .method    = HTTP_GET,
      .handler   = stream_handler,
      .user_ctx  = NULL
    };
    httpd_register_uri_handler(stream_httpd, &stream_uri);
  }
}

// =========================
// Setup
// =========================
void setup() {
  Serial.begin(115200);
  Serial.println("Booting ESP32-CAM...");

  WiFi.begin(ssid, password);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED){
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sscb_sda = SIOD_GPIO_NUM;
  config.pin_sscb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_CIF;  // 352x288, mượt và nhẹ
    config.jpeg_quality = 27;           // tăng số = giảm chất lượng = nhẹ hơn
    config.fb_count = 1;  

  if(esp_camera_init(&config) != ESP_OK){
    Serial.println("Camera init failed!");
    return;
  }

  startCameraServer();
  Serial.println("Camera stream ready!");
  Serial.print("Stream URL: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/stream");
}

void loop(){
  delay(10);
}
