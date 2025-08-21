const express = require('express');
const session = require('express-session');
const { Issuer, generators } = require('openid-client');
const path = require('path');
const app = express();
const port = 80;

// Configure view engine and static files
app.set('view engine', 'ejs');
app.use(express.static(path.join(__dirname, 'public')));

// Session middleware
app.use(session({
    secret: 'some secret',
    resave: false,
    saveUninitialized: false
}));

let client;
// Initialize OpenID Client
async function initializeClient() {
    const issuer = await Issuer.discover('https://cognito-idp.eu-north-1.amazonaws.com/eu-north-1_UTMwKW3gu');
    client = new issuer.Client({
        client_id: 'ur6bklnund2slc43r9cieqvvm',
        client_secret: 'fokl9b0euuo0rnbs70ut6od4ql7g36c701121pdfhslpntlaovn',
        redirect_uris: ['https://Prod-Hello-World-1565511133.eu-north-1.elb.amazonaws.com'],
        response_types: ['code']
    });
}
initializeClient().catch(console.error);

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