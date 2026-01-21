# Negotify Backend

SaaS platform for arbitration case management - Israeli legal market.

## Tech Stack

- **Node.js** + **Express** + **TypeScript**
- **MongoDB** + **Mongoose**
- **JWT** authentication
- **RBAC** (Role-Based Access Control)
- **Audit logging** for legal compliance

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env
```

3. Make sure MongoDB is running (local or remote)

4. Run in development:
```bash
npm run dev
```

5. Build for production:
```bash
npm run build
npm start
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register via invitation token
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user

### Invitations
- `POST /api/invitations` - Create invitation (Admin/Arbitrator)
- `GET /api/invitations` - List all invitations (Admin)
- `GET /api/invitations/token/:token` - Get invitation by token

### Cases
- `POST /api/cases` - Create case (Admin/Arbitrator)
- `GET /api/cases` - List cases (filtered by role)
- `GET /api/cases/:caseId` - Get case details
- `PATCH /api/cases/:caseId` - Update case (Admin/Arbitrator)
- `POST /api/cases/:caseId/lawyers` - Add lawyer to case
- `POST /api/cases/:caseId/parties` - Add party to case

### Documents
- `POST /api/documents` - Upload document
- `GET /api/documents/case/:caseId` - List documents for case
- `GET /api/documents/:documentId` - Get document details
- `GET /api/documents/:documentId/download` - Download document
- `PATCH /api/documents/:documentId` - Update document (Arbitrator/Admin)

### Users
- `GET /api/users` - List all users (Admin)
- `GET /api/users/:userId` - Get user details
- `PATCH /api/users/:userId/status` - Update user status (Admin)

### Audit Logs
- `GET /api/audit` - List audit logs (Admin)
- `GET /api/audit/case/:caseId` - Get case audit logs

## Roles

1. **Admin** - Full system access
2. **Arbitrator** - Creates and manages cases
3. **Lawyer** - Assigned to cases, can upload documents
4. **Party** - Limited access to assigned cases

## Security Features

- JWT-based authentication
- Role-based access control (RBAC)
- Case-level permission checks
- Document-level permission checks
- Comprehensive audit logging
- File upload validation

## Database Models

- **User** - System users with roles
- **Case** - Arbitration cases
- **Document** - Case documents with permissions
- **Invitation** - User invitation system
- **AuditLog** - Action logging for compliance

