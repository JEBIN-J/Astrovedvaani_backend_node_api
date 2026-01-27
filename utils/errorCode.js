const errorCode = {
    ERROR: {
        AUTH: {
            NO_TOKEN: 6000,
            INVALID_TOKEN: 6001,
            EXPIRED_TOKEN: 6002,
            MALFORMED_TOKEN: 6003,
            INSUFFICIENT_PERMISSIONS: 6004,
            INVALID_CREDENTIALS: 6005,
            ACCOUNT_LOCKED: 6006,
            EMAIL_NOT_VERIFIED: 6007,
            PHONE_NOT_VERIFIED: 6008,
            TOO_MANY_ATTEMPTS: 6009,
            INVALID_OTP: 6010,
            EXPIRED_OTP: 6011
        },

        VALIDATION: {
            REQUIRED_FIELD: 6100,
            INVALID_EMAIL: 6101,
            INVALID_PHONE: 6102,
            INVALID_DATE: 6103,
            INVALID_ENUM: 6104,
            STRING_TOO_LONG: 6105,
            STRING_TOO_SHORT: 6106,
            NUMBER_TOO_HIGH: 6107,
            NUMBER_TOO_LOW: 6108,
            INVALID_PATTERN: 6109,
            UNIQUE_CONSTRAINT: 6110
        },

        DATABASE: {
            RECORD_NOT_FOUND: 6200,
            DUPLICATE_ENTRY: 6201,
            CONSTRAINT_FAILED: 6202,
            TRANSACTION_FAILED: 6203,
            CONNECTION_ERROR: 6204,
            QUERY_ERROR: 6205,
            MIGRATION_ERROR: 6206
        },

        BUSINESS: {
            INSUFFICIENT_BALANCE: 6300,
            SERVICE_UNAVAILABLE: 6301,
            CONSULTATION_CONFLICT: 6302,
            INVALID_TRANSITION: 6303,
            LIMIT_REACHED: 6304,
            AGE_RESTRICTION: 6305,
            GEO_RESTRICTION: 6306,
            TIME_CONFLICT: 6307
        },

        PAYMENT: {
            DECLINED: 6400,
            INVALID_CARD: 6401,
            EXPIRED_CARD: 6402,
            INSUFFICIENT_FUNDS: 6403,
            PROCESSING_ERROR: 6404,
            REFUND_FAILED: 6405,
            FRAUD_DETECTED: 6406
        },

        EXTERNAL: {
            SMS_FAILURE: 6500,
            EMAIL_FAILURE: 6501,
            PAYMENT_GATEWAY: 6502,
            ASTROLOGY_API: 6503,
            MAP_SERVICE: 6504,
            THIRD_PARTY_API: 6505,
            SERVICE_TIMEOUT: 6506
        },

        SYSTEM: {
            INTERNAL_ERROR: 6600,
            CONFIGURATION_ERROR: 6601,
            MAINTENANCE_MODE: 6602,
            RATE_LIMIT_EXCEEDED: 6603,
            STORAGE_LIMIT: 6604,
            NETWORK_ERROR: 6605,
            ENCRYPTION_ERROR: 6606
        },

        RESOURCE: {
            NOT_FOUND: 6700,
            ALREADY_EXISTS: 6701,
            IN_USE: 6702,
            RESTRICTED: 6703,
            EXPIRED: 6704,
            LIMIT_REACHED: 6705,
            INVALID_STATE: 6706
        },

        USER: {
            PROFILE_INCOMPLETE: 6800,
            VERIFICATION_REQUIRED: 6801,
            SESSION_LIMIT: 6802,
            DEVICE_LIMIT: 6803,
            PASSWORD_WEAK: 6804,
            PASSWORD_RECENTLY_USED: 6805,
            ACTION_NOT_ALLOWED: 6806
        },

        API: {
            INVALID_REQUEST: 6900,
            MISSING_PARAMETER: 6901,
            INVALID_PARAMETER: 6902,
            UNSUPPORTED_MEDIA: 6903,
            METHOD_NOT_ALLOWED: 6904,
            NOT_ACCEPTABLE: 6905,
            VERSION_DEPRECATED: 6906
        }
    },

    HTTP_STATUS: {
        BAD_REQUEST: 400,
        UNAUTHORIZED: 401,
        FORBIDDEN: 403,
        NOT_FOUND: 404,
        CONFLICT: 409,
        INTERNAL_SERVER_ERROR: 500,
        SERVICE_UNAVAILABLE: 503
    }
};

Object.freeze(errorCode);

module.exports = errorCode;