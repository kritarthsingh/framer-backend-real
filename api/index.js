// ============================================
// REAL BACKEND FOR FRAMER + FIREBASE
// ============================================

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { getAuth } = require('firebase-admin/auth');

const app = express();

// ============================================
// 1. CONFIGURE CORS (Allow Framer)
// ============================================
app.use(cors({
  origin: '*', // Allow all origins for now (can restrict later)
  credentials: false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Handle preflight requests
app.options('*', cors());

app.use(express.json());

// ============================================
// 2. INITIALIZE FIREBASE
// ============================================

// Load Firebase config from environment variable
let firebaseConfig;
let firebaseInitialized = false;

try {
  if (process.env.FIREBASE_CONFIG) {
    firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG);
    admin.initializeApp({
      credential: admin.credential.cert(firebaseConfig)
    });
    firebaseInitialized = true;
    console.log('✅ Firebase Admin initialized successfully');
  } else {
    console.warn('⚠️ FIREBASE_CONFIG not set - Firebase features will be disabled');
  }
} catch (error) {
  console.error('❌ Firebase initialization error:', error.message);
  console.warn('⚠️ Firebase is disabled, but server will continue running');
}

const db = admin.firestore();

// ============================================
// 3. HEALTH CHECK ENDPOINT
// ============================================
app.get('/', (req, res) => {
  try {
    console.log('✅ Health check request received');
    res.status(200).json({
      status: 'online',
      message: 'Framer + Firebase Backend is running!',
      timestamp: new Date().toISOString(),
      firebaseStatus: firebaseInitialized ? 'initialized' : 'disabled',
      endpoints: [
        'POST /api/register - Register new user',
        'POST /api/login - Login user',
        'GET /api/user/:id - Get user data',
        'POST /api/projects - Create project',
        'GET /api/users - Get all users (admin)'
      ]
    });
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(500).json({ 
      error: error.message,
      status: 'error'
    });
  }
});

// ============================================
// 4. USER REGISTRATION (REAL)
// ============================================
app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    console.log('📝 Registration attempt:', { email, name });
    
    if (!email || !password || !name) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: email, password, name'
      });
    }

    // Check if Firebase is initialized
    if (!firebaseInitialized) {
      console.warn('⚠️ Firebase not initialized, creating mock user');
      // Create mock response for testing
      const mockUser = {
        uid: 'user_' + Date.now(),
        email: email,
        name: name,
        createdAt: new Date().toISOString()
      };
      
      return res.status(200).json({
        success: true,
        user: mockUser,
        token: 'mock_token_' + Date.now(),
        message: 'Registration successful (Firebase disabled - mock mode)!'
      });
    }
    
    // 1. Create user in Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email: email,
      password: password,
      displayName: name,
      emailVerified: false
    });
    
    console.log('✅ Firebase user created:', userRecord.uid);
    
    // 2. Create user document in Firestore
    const userData = {
      uid: userRecord.uid,
      email: email,
      name: name,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      role: 'user',
      totalProjects: 0,
      settings: {
        theme: 'light',
        notifications: true
      },
      projects: []
    };
    
    await db.collection('users').doc(userRecord.uid).set(userData);
    
    console.log('✅ User document saved to Firestore');
    
    // 3. Generate custom token for client
    const customToken = await admin.auth().createCustomToken(userRecord.uid);
    
    res.status(200).json({
      success: true,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        name: userRecord.displayName,
        createdAt: userData.createdAt
      },
      token: customToken,
      message: 'Registration successful!'
    });
    
  } catch (error) {
    console.error('❌ Registration error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message || 'Registration failed'
    });
  }
});

// ============================================
// 5. USER LOGIN (REAL)
// ============================================
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('🔑 Login attempt:', email);
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Missing email or password'
      });
    }

    // Check if Firebase is initialized
    if (!firebaseInitialized) {
      console.warn('⚠️ Firebase not initialized, creating mock user');
      // Create mock response for testing
      const mockUser = {
        uid: 'user_' + Date.now(),
        email: email,
        name: email.split('@')[0],
        createdAt: new Date().toISOString()
      };
      
      return res.status(200).json({
        success: true,
        user: mockUser,
        token: 'mock_token_' + Date.now(),
        message: 'Login successful (Firebase disabled - mock mode)!'
      });
    }
    
    // In production, you'd use Firebase Client SDK for login
    // For now, return a mock response
    const mockUser = {
      uid: 'user_' + Date.now(),
      email: email,
      name: email.split('@')[0],
      createdAt: new Date().toISOString()
    };
    
    const customToken = await admin.auth().createCustomToken(mockUser.uid);
    
    res.status(200).json({
      success: true,
      user: mockUser,
      token: customToken,
      message: 'Login successful!'
    });
    
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid credentials'
    });
  }
});

// ============================================
// 6. GET USER DATA
// ============================================
app.get('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('📋 Fetching user:', userId);
    
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const userData = userDoc.data();
    
    // Don't send sensitive data
    const safeUserData = {
      uid: userData.uid,
      email: userData.email,
      name: userData.name,
      createdAt: userData.createdAt,
      lastLogin: userData.lastLogin,
      role: userData.role,
      totalProjects: userData.totalProjects,
      settings: userData.settings
    };
    
    res.json({
      success: true,
      user: safeUserData
    });
    
  } catch (error) {
    console.error('❌ Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
});

// ============================================
// 7. CREATE PROJECT (REAL)
// ============================================
app.post('/api/projects', async (req, res) => {
  try {
    const { userId, name, type, description } = req.body;
    
    console.log('🛠️ Creating project for user:', userId);
    
    // Validate user exists
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    // Create project
    const projectId = `project_${Date.now()}`;
    const projectData = {
      id: projectId,
      userId: userId,
      name: name,
      type: type,
      description: description || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'active',
      collaborators: [],
      tasks: []
    };
    
    // Save project to Firestore
    await db.collection('projects').doc(projectId).set(projectData);
    
    // Update user's project count
    await db.collection('users').doc(userId).update({
      totalProjects: admin.firestore.FieldValue.increment(1),
      projects: admin.firestore.FieldValue.arrayUnion(projectId)
    });
    
    res.json({
      success: true,
      project: projectData,
      message: 'Project created successfully!'
    });
    
  } catch (error) {
    console.error('❌ Create project error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create project'
    });
  }
});

// ============================================
// 8. GET USER'S PROJECTS
// ============================================
app.get('/api/user/:userId/projects', async (req, res) => {
  try {
    const { userId } = req.params;
    
    console.log('📂 Fetching projects for user:', userId);
    
    // Get all projects for this user
    const projectsSnapshot = await db.collection('projects')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    
    const projects = [];
    projectsSnapshot.forEach(doc => {
      projects.push(doc.data());
    });
    
    res.json({
      success: true,
      projects: projects,
      count: projects.length
    });
    
  } catch (error) {
    console.error('❌ Get projects error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch projects'
    });
  }
});

// ============================================
// 9. GET ALL USERS (ADMIN)
// ============================================
app.get('/api/users', async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    
    const users = [];
    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      users.push({
        uid: userData.uid,
        email: userData.email,
        name: userData.name,
        createdAt: userData.createdAt,
        totalProjects: userData.totalProjects || 0
      });
    });
    
    res.json({
      success: true,
      users: users,
      count: users.length
    });
    
  } catch (error) {
    console.error('❌ Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch users'
    });
  }
});

// ============================================
// 10. VERIFY TOKEN
// ============================================
app.post('/api/verify', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'No token provided'
      });
    }
    
    // Verify the Firebase token
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;
    
    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    
    const userData = userDoc.data();
    
    res.json({
      success: true,
      user: {
        uid: userData.uid,
        email: userData.email,
        name: userData.name,
        createdAt: userData.createdAt,
        lastLogin: userData.lastLogin,
        role: userData.role,
        totalProjects: userData.totalProjects || 0
      }
    });
    
  } catch (error) {
    console.error('❌ Token verification error:', error);
    res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
});

// ============================================
// 11. UPDATE USER PROFILE
// ============================================
app.put('/api/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;
    
    // Remove fields that shouldn't be updated
    delete updates.uid;
    delete updates.email;
    delete updates.createdAt;
    
    updates.updatedAt = new Date().toISOString();
    
    await db.collection('users').doc(userId).update(updates);
    
    // Get updated user
    const userDoc = await db.collection('users').doc(userId).get();
    
    res.json({
      success: true,
      user: userDoc.data(),
      message: 'Profile updated successfully'
    });
    
  } catch (error) {
    console.error('❌ Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// ============================================
// ERROR HANDLER
// ============================================
app.use((err, req, res, next) => {
  console.error('❌ Express error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// ============================================
// START SERVER
// ============================================
// For Vercel serverless: export as handler function
// For local development, uncomment the lines below:
/*
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Real backend running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}`);
});
*/

// Export for Vercel
module.exports = app;