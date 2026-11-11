-- Place names for any Indian pincode, cached from India Post's public pincode service.
CREATE TABLE "PincodeDirectory" (
    "pincode" TEXT NOT NULL,
    "found" BOOLEAN NOT NULL,
    "district" TEXT,
    "state" TEXT,
    "area" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PincodeDirectory_pkey" PRIMARY KEY ("pincode")
);
