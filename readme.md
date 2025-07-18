# E2E Backend API

Backend service for E2E Transit Solutions with authentication and user management.

## Setup

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your credentials:
# - SUPABASE_URL
# - SUPABASE_KEY
# - JWT_SECRET
# - OTP_TTL_MIN
# - EMAIL_USER
# - EMAIL_PASS
# - PORT
```

## Development

```bash
# Start development server
nodemon index.ts

# Run tests
npm test

```

## API Endpoints

### Authentication

#### POST /auth/signup

Create new user account

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

#### POST /auth/verify

Verify email with OTP or reset password

```json
{
  "email": "user@example.com",
  "otp": "123456",
  "newPassword": "newpassword" // optional, for password reset
}
```

#### POST /auth/login

Login with email/password

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

#### POST /auth/forgot-password

Request password reset OTP

```json
{
  "email": "user@example.com"
}
```

#### POST /auth/syncuser

Sync OAuth provider user

```json
{
  "id": "provider-user-id",
  "email": "user@example.com",
  "provider": "google",
  "provider_id": "google-123"
}
```

#Postman Collection Url:

```
https://web.postman.co/workspace/8ad3d8e4-5a7f-43a8-8610-0dbe302bae9e/collection/33184608-040740cc-af9d-40b9-8c1c-b70cc7bf3c12?action=share&source=copy-link&creator=33184608
```

## Testing

The project uses Jest for testing. Tests are located in the `/tests` directory.

```bash
# Run all tests
npm test
```
