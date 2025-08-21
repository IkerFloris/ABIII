const express = require('express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');
const path = require('path');
const app = express();
const port = process.env.PORT || 80;

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

// Session middleware with secure settings
app.use(session({
    secret: process.env.SESSION_SECRET || 'some-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

let client;
// Initialize OpenID Client with error handling
async function initializeClient() {
    try {
        const issuer = await Issuer.discover('https://cognito-idp.eu-north-1.amazonaws.com/eu-north-1_UTMwKW3gu');
        client = new issuer.Client({
            client_id: 'ur6bklnund2slc43r9cieqvvm',
            client_secret: process.env.COGNITO_CLIENT_SECRET || '<client secret>',
            redirect_uris: ['https://Prod-Hello-World-1565511133.eu-north-1.elb.amazonaws.com'],
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
        userInfo: req.session.userInfo
    });
});

app.get('/elephants', checkAuth, (req, res) => {
    if (!req.isAuthenticated) {
        return res.redirect('/login');
    }
    res.render('elephants', {
        isAuthenticated: req.isAuthenticated,
        userInfo: req.session.userInfo
    });
});

app.get('/login', (req, res) => {
    const nonce = generators.nonce();
    const state = generators.state();

    req.session.nonce = nonce;
    req.session.state = state;

    const authUrl = client.authorizationUrl({
        scope: 'phone openid email',
        state: state,
        nonce: nonce,
    });

    res.redirect(authUrl);
});

app.get(getPathFromURL('https://Prod-Hello-World-1565511133.eu-north-1.elb.amazonaws.com'), async (req, res) => {
    try {
        const params = client.callbackParams(req);
        const tokenSet = await client.callback(
            'https://Prod-Hello-World-1565511133.eu-north-1.elb.amazonaws.com',
            params,
            {
                nonce: req.session.nonce,
                state: req.session.state
            }
        );

        const userInfo = await client.userinfo(tokenSet.access_token);
        req.session.userInfo = userInfo;

        res.redirect('/elephants');
    } catch (err) {
        console.error('Callback error:', err);
        res.redirect('/');
    }
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    const logoutUrl = `https://eu-north-1utmwkw3gu.auth.eu-north-1.amazoncognito.com/logout?client_id=ur6bklnund2slc43r9cieqvvm&logout_uri=https://Prod-Hello-World-1565511133.eu-north-1.elb.amazonaws.com`;
    res.redirect(logoutUrl);
});

app.listen(port, () => {
    console.log(`App listening at http://localhost:${port}`);
});

function getPathFromURL(urlString) {
    try {
        const url = new URL(urlString);
        return url.pathname;
    } catch (error) {
        console.error('Invalid URL:', error);
        return null;
    }
}

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('error', {
        message: 'Something broke!',
        error: process.env.NODE_ENV === 'development' ? err : {}
    });
});

// Graceful shutdown
function shutdown() {
    console.log('Received shutdown signal');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });

    // Force close after 10s
    setTimeout(() => {
        console.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Initialize server
const server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`);
});

// Initialize OpenID Client
initializeClient().catch(error => {
    console.error('Failed to start application:', error);
    process.exit(1);
});