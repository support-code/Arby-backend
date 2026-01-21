# 📝 מדריך מלא ל-.env של Backend

## איך ליצור את הקובץ

1. בתיקיית `back-end`, צור קובץ בשם `.env`
2. העתק את התוכן למטה והתאם לצרכים שלך

---

## קובץ .env מלא עם הסברים

```env
# ============================================
# Server Configuration
# ============================================
PORT=5000
NODE_ENV=development

# ============================================
# MongoDB Database - **חשוב מאוד!**
# ============================================

# אפשרות 1: MongoDB מקומי (אם MongoDB מותקן על המחשב שלך)
MONGODB_URI=mongodb://localhost:27017/negotify

# אפשרות 2: MongoDB עם שם משתמש וסיסמה
# MONGODB_URI=mongodb://username:password@localhost:27017/negotify

# אפשרות 3: MongoDB Atlas (Cloud - מומלץ ל-Production)
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/negotify?retryWrites=true&w=majority

# ============================================
# JWT Authentication - **חשוב מאוד!**
# ============================================
# מפתח סודי להצפנת tokens
# ב-Production: השתמש במפתח ארוך ואקראי (לפחות 32 תווים)
# יצירת מפתח: openssl rand -base64 32
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production-minimum-32-characters

# זמן תוקף של token (7d = 7 ימים)
JWT_EXPIRES_IN=7d

# ============================================
# CORS Configuration
# ============================================
# כתובת ה-Frontend (למניעת CORS errors)
FRONTEND_URL=http://localhost:3000

# ============================================
# File Upload Configuration
# ============================================
# גודל מקסימלי לקובץ (בבייטים)
# 10485760 = 10MB
MAX_FILE_SIZE=10485760

# תיקייה לאחסון קבצים מועלים
UPLOAD_DIR=./uploads

# ============================================
# Email Configuration (Gmail)
# ============================================
# אימייל Gmail לשליחת סיסמאות
EMAIL_USER=support@akaino.com

# App Password מ-Google (לא הסיסמה הרגילה!)
# איך להשיג: https://support.google.com/accounts/answer/185833
EMAIL_APP_PASSWORD=jgvmzaelhhrqlhub
```

---

## הסבר מפורט על כל משתנה

### 🗄️ MONGODB_URI

**זה המשתנה הכי חשוב!** בלי MongoDB, המערכת לא תעבוד.

#### אפשרות 1: MongoDB מקומי
אם התקנת MongoDB על המחשב שלך:
```env
MONGODB_URI=mongodb://localhost:27017/negotify
```

**איך לבדוק ש-MongoDB רץ:**
```bash
# Windows:
# פתח Services ובדוק ש-MongoDB רץ

# Linux/Mac:
sudo systemctl status mongod
# או:
ps aux | grep mongod
```

#### אפשרות 2: MongoDB Atlas (מומלץ!)
MongoDB Atlas הוא MongoDB בענן - חינמי עד 512MB.

**איך להשיג:**
1. הירשם ב-https://www.mongodb.com/cloud/atlas (חינמי)
2. צור **Free Cluster** (M0)
3. לחץ על **"Connect"**
4. בחר **"Connect your application"**
5. העתק את ה-Connection String
6. החלף `<password>` בסיסמה שיצרת
7. החלף `<dbname>` ב-`negotify`

**דוגמה:**
```env
MONGODB_URI=mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/negotify?retryWrites=true&w=majority
```

**חשוב ב-Atlas:**
- הוסף את ה-IP שלך ל-**Network Access** (או `0.0.0.0/0` לכל ה-IPs)
- צור **Database User** עם סיסמה חזקה

---

### 🔐 JWT_SECRET

מפתח סודי להצפנת tokens. **חשוב מאוד לשנות ב-Production!**

**יצירת מפתח חזק:**
```bash
# Linux/Mac:
openssl rand -base64 32

# Windows (PowerShell):
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))

# או Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

**דוגמה למפתח חזק:**
```env
JWT_SECRET=K8mN3pQ7rT2vW5xZ9aB1cD4eF6gH8iJ0kL2mN4pQ6rS8tU0vW2xY4zA6bC8dE0
```

---

### 🌐 FRONTEND_URL

כתובת ה-Frontend שלך. זה מונע CORS errors.

**Development:**
```env
FRONTEND_URL=http://localhost:3000
```

**Production:**
```env
FRONTEND_URL=https://yourdomain.com
```

---

### 📁 MAX_FILE_SIZE

גודל מקסימלי לקובץ (בבייטים).

**דוגמאות:**
- `10485760` = 10MB (ברירת מחדל)
- `52428800` = 50MB
- `104857600` = 100MB

---

### 📂 UPLOAD_DIR

תיקייה לאחסון קבצים. התיקייה תיווצר אוטומטית אם לא קיימת.

**דוגמאות:**
- `./uploads` - בתיקיית הפרויקט (ברירת מחדל)
- `/var/www/uploads` - תיקייה מוחלטת (ל-Production)

---

## דוגמה לקובץ .env מינימלי (Development)

```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/negotify
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRES_IN=7d
FRONTEND_URL=http://localhost:3000
MAX_FILE_SIZE=10485760
UPLOAD_DIR=./uploads
```

---

## דוגמה לקובץ .env ל-Production

```env
PORT=5000
NODE_ENV=production
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/negotify?retryWrites=true&w=majority
JWT_SECRET=K8mN3pQ7rT2vW5xZ9aB1cD4eF6gH8iJ0kL2mN4pQ6rS8tU0vW2xY4zA6bC8dE0
JWT_EXPIRES_IN=7d
FRONTEND_URL=https://negotify.com
MAX_FILE_SIZE=52428800
UPLOAD_DIR=/var/www/negotify/uploads
```

---

## בדיקה שהכל עובד

לאחר יצירת `.env`, הרץ:

```bash
cd back-end
npm run dev
```

**אם הכל תקין, תראה:**
```
✅ MongoDB connected successfully
🚀 Server running on port 5000
📝 Environment: development
```

**אם יש שגיאה:**
- ❌ `MongoDB connection error` → בדוק את `MONGODB_URI`
- ❌ `Port already in use` → שנה את `PORT`
- ❌ `CORS error` → בדוק את `FRONTEND_URL`

---

## פתרון בעיות נפוצות

### MongoDB לא מתחבר

**1. MongoDB לא רץ:**
```bash
# Windows: פתח Services → MongoDB
# Linux: sudo systemctl start mongod
# Mac: brew services start mongodb-community
```

**2. כתובת שגויה:**
- ודא ש-`MONGODB_URI` נכון
- נסה `mongodb://127.0.0.1:27017/negotify` במקום `localhost`

**3. MongoDB Atlas:**
- ודא שה-IP שלך ב-Network Access
- בדוק את שם המשתמש והסיסמה

---

### Port תפוס

```bash
# Windows:
netstat -ano | findstr :5000

# Linux/Mac:
lsof -i :5000
```

שנה את `PORT` ב-`.env` למספר אחר (למשל `5001`).

---

## Checklist לפני Production

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` - מפתח חזק וייחודי (32+ תווים)
- [ ] `MONGODB_URI` - MongoDB Atlas או MongoDB מאובטח
- [ ] `FRONTEND_URL` - כתובת ה-Production
- [ ] `MAX_FILE_SIZE` - התאם לצרכים
- [ ] `UPLOAD_DIR` - תיקייה מאובטחת (לא בתיקיית הפרויקט)
- [ ] `.env` לא ב-Git (כבר ב-.gitignore)

---

**שאלות?** בדוק את ה-README.md או פנה לצוות הפיתוח.

