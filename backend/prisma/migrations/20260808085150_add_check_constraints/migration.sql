ALTER TABLE [dbo].[transaction] ADD CONSTRAINT [chk_transaction_status] CHECK ([status] IN ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'UNKNOWN'));
ALTER TABLE [dbo].[app_user] ADD CONSTRAINT [chk_app_user_role] CHECK ([role] IN ('PASSENGER', 'DRIVER', 'ADMIN'));
ALTER TABLE [dbo].[driver_profile] ADD CONSTRAINT [chk_driver_verificationStatus] CHECK ([verificationStatus] IN ('PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE [dbo].[taxi_qr] ADD CONSTRAINT [chk_taxi_qr_status] CHECK ([status] IN ('ACTIVE', 'DISABLED', 'REPLACED'));