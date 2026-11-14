# Storage API

The PHP file storage service is not implemented. `storage-server/php/` is only a reserved directory. Phase 4 did not build it. Clinic invoice logos are stored as data URLs on the Clinic business settings row.

## Intended shape

The service will run on existing PHP hosting, for example `https://files.yourdomain.com`. It will not require Node.js or Next.js. Next.js applications will call it from the server with HMAC-SHA256 signed requests. The signing secret stays on the server. The browser never receives it.

Planned endpoints:

- `GET /api/health`
- `POST /api/upload`
- `GET /api/download`
- `DELETE /api/delete`

Files will be stored outside the public web root when the host allows it. Otherwise direct access will be denied with `.htaccess`, directory listing will be off, and PHP execution in the storage directory will be disabled. Stored objects will use generated names, not the original filename.

Logical layout:

```text
storage/
  clinic/
    <business-id>/
      patients/
      prescriptions/
      invoices/
      branding/
      documents/
```

The Clinic database will store file metadata. Neon will not store the file bytes. A download will require an authenticated Clinic user, membership, permission, and a metadata row that belongs to that business. One business will not be able to address another business's files.

No hosting credentials have been provided, and nothing has been deployed.
