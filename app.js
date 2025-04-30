const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Express app yaratish
const app = express();
const port = process.env.PORT || 3000;

// View engine sozlamalari
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 3600000 } // 1 soat
}));

// Statik fayllar uchun
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Upload papkasini yaratish
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer konfiguratsiyasi
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const filePrefix = file.fieldname === 'pasport_file' ? 'pasport_' : 'foto_';
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0];
    const uniqueFilename = filePrefix + timestamp + '_' + file.originalname;
    cb(null, uniqueFilename);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Ma'lumotlar bazasi va foydalanuvchilar fayllari
const dbPath = path.join(__dirname, 'data.json');
const usersPath = path.join(__dirname, 'users.json');

// Agar fayllar mavjud bo'lmasa, yaratish
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify([]));
}

if (!fs.existsSync(usersPath)) {
  fs.writeFileSync(usersPath, JSON.stringify([
    { "username": "admin", "password": "admin123" }
  ]));
}

// Ma'lumotlarni o'qish
function readData() {
  const data = fs.readFileSync(dbPath);
  return JSON.parse(data);
}

// Ma'lumotlarni yozish
function writeData(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

// Foydalanuvchilarni o'qish
function readUsers() {
  const users = fs.readFileSync(usersPath);
  return JSON.parse(users);
}

// Authentication middleware
function requireLogin(req, res, next) {
  if (req.session.loggedIn) {
    next();
  } else {
    res.redirect('/login');
  }
}

// Login sahifasi
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// Login jarayoni
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  
  // Foydalanuvchilarni tekshirish
  const users = readUsers();
  const user = users.find(u => u.username === username && u.password === password);
  
  if (user) {
    req.session.loggedIn = true;
    req.session.username = username;
    res.redirect('/data');
  } else {
    res.render('login', { error: 'Noto\'g\'ri foydalanuvchi nomi yoki parol' });
  }
});

// Logout
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// Bosh sahifa - ma'lumot kiritish
app.get('/', requireLogin, (req, res) => {
  res.render('index', { username: req.session.username });
});

// Ma'lumotlarni ko'rish
app.get('/data', requireLogin, (req, res) => {
  const data = readData();
  res.render('view', { 
    data: data,
    username: req.session.username
  });
});

// Ma'lumot yuborish
app.post('/submit', requireLogin, upload.fields([
  { name: 'pasport_file', maxCount: 1 },
  { name: 'foto_yuklash', maxCount: 1 }
]), (req, res) => {
  try {
    const { ismi, familiyasi, telefon } = req.body;
    
    // Fayllarni tekshirish
    const pasport_file = req.files['pasport_file'] ? req.files['pasport_file'][0].filename : null;
    const foto = req.files['foto_yuklash'] ? req.files['foto_yuklash'][0].filename : null;
    
    // Yangi ma'lumot
    const newData = {
      ismi,
      familiyasi,
      telefon,
      timestamp: new Date().toISOString(),
      pasport_file,
      foto
    };
    
    // Ma'lumotlarni saqlash
    const data = readData();
    data.push(newData);
    writeData(data);
    
    res.redirect('/data');
  } catch (error) {
    console.error('Xatolik:', error);
    res.render('error', {
      status: 500,
      message: 'Server xatosi',
      description: 'Ma\'lumotlarni saqlashda xatolik yuz berdi.'
    });
  }
});

// 404 xatolik
app.use((req, res) => {
  res.status(404).render('error', {
    status: 404,
    message: 'Sahifa topilmadi',
    description: 'Siz qidirayotgan sahifa mavjud emas.'
  });
});

// Server xatoliklari
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', {
    status: 500,
    message: 'Server xatosi',
    description: 'Serverda kutilmagan xatolik yuz berdi.'
  });
});

// Serverni ishga tushirish
app.listen(port, () => {
  console.log(`Server http://localhost:${port} portida ishga tushdi`);
});
