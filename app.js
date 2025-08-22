const express = require('express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Error handling
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    process.exit(1);
});

// Configure view engine and static files
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
    secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

let client;

// Initialize OpenID Client
async function initializeClient() {
    try {
        // Replace with your Cognito User Pool details
        const cognitoRegion = process.env.COGNITO_REGION || 'us-east-1';
        const userPoolId = process.env.COGNITO_USER_POOL_ID || 'your-user-pool-id';
        const clientId = process.env.COGNITO_CLIENT_ID || 'your-client-id';
        const clientSecret = process.env.COGNITO_CLIENT_SECRET || 'your-client-secret';
        const redirectUri = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
        
        const issuer = await Issuer.discover(`https://cognito-idp.${cognitoRegion}.amazonaws.com/${userPoolId}`);
        
        client = new issuer.Client({
            client_id: clientId,
            client_secret: clientSecret,
            redirect_uris: [redirectUri],
            response_types: ['code']
        });
        
        console.log('OpenID Client initialized successfully');
    } catch (error) {
        console.error('Failed to initialize OpenID Client:', error);
        throw error;
    }
}

// Auth middleware
const checkAuth = (req, res, next) => {
    if (!req.session.userInfo) {
        req.isAuthenticated = false;
    } else {
        req.isAuthenticated = true;
    }
    next();
};

// Routes
app.get('/', checkAuth, (req, res) => {
    res.render('home', {
        isAuthenticated: req.isAuthenticated,
        userInfo: req.session.userInfo || null
    });
});

app.get('/swans', checkAuth, (req, res) => {
    if (!req.isAuthenticated) {
        return res.redirect('/login');
    }
    res.render('swans', {
        isAuthenticated: req.isAuthenticated,
        userInfo: req.session.userInfo
    });
});

app.get('/login', (req, res) => {
    if (!client) {
        return res.status(500).send('Authentication service not available');
    }
    
    const nonce = generators.nonce();
    const state = generators.state();

    req.session.nonce = nonce;
    req.session.state = state;

    const authUrl = client.authorizationUrl({
        scope: 'openid email profile',
        state: state,
        nonce: nonce,
    });

    res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
    try {
        if (!client) {
            throw new Error('Authentication service not available');
        }
        
        const params = client.callbackParams(req);
        const redirectUri = process.env.REDIRECT_URI || 'http://localhost:3000/callback';
        
        const tokenSet = await client.callback(
            redirectUri,
            params,
            {
                nonce: req.session.nonce,
                state: req.session.state
            }
        );

        const userInfo = await client.userinfo(tokenSet.access_token);
        req.session.userInfo = userInfo;

        res.redirect('/swans');
    } catch (err) {
        console.error('Callback error:', err);
        res.redirect('/?error=auth_failed');
    }
});

app.get('/logout', (req, res) => {
    const logoutUri = process.env.LOGOUT_URI || 'http://localhost:3000';
    const cognitoDomain = process.env.COGNITO_DOMAIN || 'your-cognito-domain';
    const clientId = process.env.COGNITO_CLIENT_ID || 'your-client-id';
    
    req.session.destroy((err) => {
        if (err) {
            console.error('Session destruction error:', err);
        }
        const logoutUrl = `https://${cognitoDomain}/logout?client_id=${clientId}&logout_uri=${logoutUri}`;
        res.redirect(logoutUrl);
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        message: 'Something went wrong!',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// Graceful shutdown
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Swan Migration App listening on port ${port}`);
});

function shutdown() {
    console.log('Received shutdown signal');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });

    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Initialize the client
initializeClient().catch(error => {
    console.error('Failed to start application:', error);
    process.exit(1);
});