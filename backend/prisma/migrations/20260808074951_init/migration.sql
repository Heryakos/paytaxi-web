BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[otp_challenge] (
    [id] NVARCHAR(1000) NOT NULL,
    [phone] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL,
    [codeHash] NVARCHAR(1000) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [attempts] INT NOT NULL CONSTRAINT [otp_challenge_attempts_df] DEFAULT 0,
    [consumedAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [otp_challenge_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [otp_challenge_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[app_session] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [expiresAt] DATETIME2 NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [app_session_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [app_session_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[app_user] (
    [id] NVARCHAR(1000) NOT NULL,
    [phone] NVARCHAR(1000) NOT NULL,
    [role] NVARCHAR(1000) NOT NULL CONSTRAINT [app_user_role_df] DEFAULT 'PASSENGER',
    [name] NVARCHAR(1000),
    [isVerified] BIT NOT NULL CONSTRAINT [app_user_isVerified_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [app_user_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [app_user_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [app_user_phone_key] UNIQUE NONCLUSTERED ([phone])
);

-- CreateTable
CREATE TABLE [dbo].[driver_profile] (
    [id] NVARCHAR(1000) NOT NULL,
    [userId] NVARCHAR(1000) NOT NULL,
    [displayName] NVARCHAR(1000) NOT NULL,
    [nationalIdUrl] NVARCHAR(1000),
    [licenseUrl] NVARCHAR(1000),
    [vehicleMake] NVARCHAR(1000),
    [vehicleModel] NVARCHAR(1000),
    [vehicleColor] NVARCHAR(1000),
    [plateNumber] NVARCHAR(1000) NOT NULL,
    [profilePhotoUrl] NVARCHAR(1000),
    [verificationStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [driver_profile_verificationStatus_df] DEFAULT 'PENDING',
    [addispaySubMerchantId] NVARCHAR(1000),
    [payoutAccountRef] NVARCHAR(1000),
    [rating] DECIMAL(3,2) NOT NULL CONSTRAINT [driver_profile_rating_df] DEFAULT 5.00,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [driver_profile_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [driver_profile_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [driver_profile_userId_key] UNIQUE NONCLUSTERED ([userId])
);

-- CreateTable
CREATE TABLE [dbo].[taxi_qr] (
    [id] NVARCHAR(1000) NOT NULL,
    [taxiId] NVARCHAR(1000) NOT NULL,
    [driverProfileId] NVARCHAR(1000) NOT NULL,
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [taxi_qr_status_df] DEFAULT 'ACTIVE',
    [qrPayloadUrl] NVARCHAR(1000) NOT NULL,
    [backupCode] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [taxi_qr_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [disabledAt] DATETIME2,
    [disabledReason] NVARCHAR(1000),
    CONSTRAINT [taxi_qr_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [taxi_qr_taxiId_key] UNIQUE NONCLUSTERED ([taxiId])
);

-- CreateTable
CREATE TABLE [dbo].[transaction] (
    [id] NVARCHAR(1000) NOT NULL,
    [taxiQrId] NVARCHAR(1000) NOT NULL,
    [driverProfileId] NVARCHAR(1000) NOT NULL,
    [passengerUserId] NVARCHAR(1000),
    [amount] DECIMAL(12,2) NOT NULL,
    [currency] NVARCHAR(1000) NOT NULL CONSTRAINT [transaction_currency_df] DEFAULT 'ETB',
    [status] NVARCHAR(1000) NOT NULL CONSTRAINT [transaction_status_df] DEFAULT 'PENDING',
    [addispayTransactionRef] NVARCHAR(1000),
    [addispayRawPayload] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [transaction_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL CONSTRAINT [transaction_updatedAt_df] DEFAULT CURRENT_TIMESTAMP,
    [confirmedAt] DATETIME2,
    CONSTRAINT [transaction_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [transaction_addispayTransactionRef_key] UNIQUE NONCLUSTERED ([addispayTransactionRef])
);

-- CreateTable
CREATE TABLE [dbo].[webhook_event] (
    [id] NVARCHAR(1000) NOT NULL,
    [provider] NVARCHAR(1000) NOT NULL CONSTRAINT [webhook_event_provider_df] DEFAULT 'ADDISPAY',
    [providerEventId] NVARCHAR(1000) NOT NULL,
    [eventType] NVARCHAR(1000),
    [transactionId] NVARCHAR(1000),
    [rawPayload] NVARCHAR(1000),
    [processed] BIT NOT NULL CONSTRAINT [webhook_event_processed_df] DEFAULT 0,
    [receivedAt] DATETIME2 NOT NULL CONSTRAINT [webhook_event_receivedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [webhook_event_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [webhook_event_provider_providerEventId_key] UNIQUE NONCLUSTERED ([provider],[providerEventId])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [transaction_driverProfileId_idx] ON [dbo].[transaction]([driverProfileId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [transaction_taxiQrId_idx] ON [dbo].[transaction]([taxiQrId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [transaction_status_idx] ON [dbo].[transaction]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [transaction_createdAt_idx] ON [dbo].[transaction]([createdAt]);

-- AddForeignKey
ALTER TABLE [dbo].[app_session] ADD CONSTRAINT [app_session_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[app_user]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[driver_profile] ADD CONSTRAINT [driver_profile_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[app_user]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[taxi_qr] ADD CONSTRAINT [taxi_qr_driverProfileId_fkey] FOREIGN KEY ([driverProfileId]) REFERENCES [dbo].[driver_profile]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[transaction] ADD CONSTRAINT [transaction_taxiQrId_fkey] FOREIGN KEY ([taxiQrId]) REFERENCES [dbo].[taxi_qr]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[transaction] ADD CONSTRAINT [transaction_driverProfileId_fkey] FOREIGN KEY ([driverProfileId]) REFERENCES [dbo].[driver_profile]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[transaction] ADD CONSTRAINT [transaction_passengerUserId_fkey] FOREIGN KEY ([passengerUserId]) REFERENCES [dbo].[app_user]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
