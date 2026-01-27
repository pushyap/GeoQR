# GeoQR - Complete Testing Guide

## Prerequisites
- Node.js installed
- Backend server running on port 3000
- PostgreSQL database connected (Neon)

---

## Step 1: Start the Backend

```bash
cd backend
node server.js
```

Expected output:
```
✅ Resend email service initialized
✅ Connected to Neon PostgreSQL
✅ Database connection established
✅ Server is listening on port 3000
```

---

## Step 2: Seed the Database

Run the seed script to create test users:
```bash
cd backend
node scripts/seed.js
```

This creates:
| Role | Email | Password |
|------|-------|----------|
| **Admin** | admin@geoqr.local | password123 |
| **Faculty** | sarah@geoqr.local | password123 |
| **Student** | john@geoqr.local | password123 |
| **Device** | DEV-001 | device123 |

---

## Step 3: Test User Authentication

### 3.1 Login as Student
```bash
curl -X POST http://localhost:3000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"john@geoqr.local\",\"password\":\"password123\",\"role\":\"student\"}"
```
**Save the token!** Example: `eyJhbGciOiJIUzI1NiIsInR5cCI6...`

### 3.2 Login as Admin
```bash
curl -X POST http://localhost:3000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"admin@geoqr.local\",\"password\":\"password123\",\"role\":\"admin\"}"
```

### 3.3 Login as Faculty
```bash
curl -X POST http://localhost:3000/api/auth/login ^
  -H "Content-Type: application/json" ^
  -d "{\"email\":\"sarah@geoqr.local\",\"password\":\"password123\",\"role\":\"faculty\"}"
```

---

## Step 4: Test Student Dashboard API

Replace `YOUR_STUDENT_TOKEN` with the token from Step 3.1:

```bash
# Dashboard summary
curl http://localhost:3000/api/student/dashboard ^
  -H "Authorization: Bearer YOUR_STUDENT_TOKEN"

# Statistics
curl http://localhost:3000/api/student/statistics ^
  -H "Authorization: Bearer YOUR_STUDENT_TOKEN"

# Attendance history
curl http://localhost:3000/api/student/attendance ^
  -H "Authorization: Bearer YOUR_STUDENT_TOKEN"

# Profile
curl http://localhost:3000/api/student/profile ^
  -H "Authorization: Bearer YOUR_STUDENT_TOKEN"
```

---

## Step 5: Test Admin Dashboard API

Replace `YOUR_ADMIN_TOKEN` with the token from Step 3.2:

```bash
# Admin dashboard
curl http://localhost:3000/api/admin/dashboard ^
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# List users
curl http://localhost:3000/api/admin/users ^
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Suspicious activity
curl http://localhost:3000/api/admin/suspicious ^
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"

# Daily report
curl "http://localhost:3000/api/admin/reports?type=daily" ^
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

---

## Step 6: Test Device Authentication

```bash
# Device login
curl -X POST http://localhost:3000/api/devices/auth ^
  -H "Content-Type: application/json" ^
  -d "{\"device_code\":\"DEV-001\",\"password\":\"device123\"}"
```
**Save the device token!**

```bash
# Get signed QR code
curl http://localhost:3000/api/devices/qr ^
  -H "Authorization: Bearer YOUR_DEVICE_TOKEN"

# Device heartbeat
curl -X POST http://localhost:3000/api/devices/heartbeat ^
  -H "Authorization: Bearer YOUR_DEVICE_TOKEN"
```

---

## Step 7: Test Frontend in Browser

1. **Open login page**: `frontend/login.html`
2. **Select role** (Student/Faculty/Admin)
3. **Enter credentials** from Step 2
4. **Verify redirect** to correct dashboard

### Expected behavior:
- **Student** → `student-dashboard.html` → Shows real data from API
- **Admin** → `admin-dashboard.html` → Shows system metrics
- **Faculty** → `faculty-dashboard.html` → Shows session management

---

## Step 8: Full E2E Attendance Flow

### Complete workflow:
1. Faculty starts a session
2. Device generates signed QR code
3. Student scans QR with their phone
4. Attendance is recorded in database

### Commands:
```bash
# 1. Faculty starts session
curl -X POST http://localhost:3000/api/sessions/start ^
  -H "Authorization: Bearer YOUR_FACULTY_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"location_id\":1,\"subject\":\"Computer Science 101\"}"

# 2. Get signed QR from device
curl http://localhost:3000/api/devices/qr ^
  -H "Authorization: Bearer YOUR_DEVICE_TOKEN"

# 3. Student scans (simulated)
curl -X POST http://localhost:3000/api/attendance/scan ^
  -H "Authorization: Bearer YOUR_STUDENT_TOKEN" ^
  -H "Content-Type: application/json" ^
  -d "{\"qr\":\"SIGNED_QR_CONTENT\",\"lat\":12.9716,\"lng\":77.5946}"
```

---

## API Endpoint Quick Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/auth/login` | POST | None | User login |
| `/api/auth/register` | POST | None | User registration |
| `/api/student/dashboard` | GET | Student JWT | Dashboard data |
| `/api/student/statistics` | GET | Student JWT | Analytics |
| `/api/student/profile` | GET/PUT | Student JWT | Profile |
| `/api/student/attendance` | GET | Student JWT | History |
| `/api/admin/dashboard` | GET | Admin JWT | System metrics |
| `/api/admin/users` | GET/POST | Admin JWT | User management |
| `/api/admin/reports` | GET | Admin JWT | Reports |
| `/api/admin/suspicious` | GET | Admin JWT | Security alerts |
| `/api/devices/auth` | POST | None | Device login |
| `/api/devices/qr` | GET | Device JWT | Signed QR |
| `/api/devices/heartbeat` | POST | Device JWT | Health ping |
| `/api/sessions/start` | POST | Faculty JWT | Start session |
| `/api/attendance/scan` | POST | Student JWT | Mark attendance |

---

## Troubleshooting

### Port already in use:
```bash
taskkill /F /IM node.exe
node server.js
```

### Database connection failed:
- Check `.env` file has correct `DATABASE_URL`
- Verify Neon dashboard is accessible

### Token expired:
- Tokens are valid for 24 hours
- Re-login to get a new token
