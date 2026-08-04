const express = require("express");
const database = require("../database/database");
const {
    requireRole,
    requireRoles
} = require("../middleware/auth");

const router = express.Router();

const organizationId = 1;

function getDatabase(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        database.get(sql, parameters, (error, row) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(row);
        });
    });
}

function runDatabase(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        database.run(sql, parameters, function (error) {
            if (error) {
                reject(error);
                return;
            }

            resolve({
                changes: this.changes
            });
        });
    });
}

function normalizeRequiredText(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim();
}

function normalizeOptionalText(value) {
    if (typeof value !== "string") {
        return null;
    }

    return value.trim() || null;
}

function normalizeHexColor(value, fallbackColor) {
    if (typeof value !== "string") {
        return fallbackColor;
    }

    const normalizedColor = value.trim();

    const validHexColor =
        /^#[0-9a-fA-F]{6}$/.test(normalizedColor);

    return validHexColor
        ? normalizedColor
        : fallbackColor;
}

function normalizeActiveStatus(value) {
    return value === "1" ? 1 : 0;
}

async function getOrganization() {
    return getDatabase(
        `
            SELECT
                organization_id,
                organization_name,
                industry,
                logo_path,
                primary_color,
                secondary_color,
                is_active,
                created_at
            FROM organizations
            WHERE organization_id = ?
        `,
        [organizationId]
    );
}

router.get("/", requireRole("Administrator"), async (
    request,
    response,
    next
) => {
    try {
        const organization =
            await getOrganization();

        if (!organization) {
            response.status(404).send(
                "Organization not found."
            );

            return;
        }

        response.render("settings/index", {
            pageTitle: "Settings",
            currentPage: "settings",
            organization,
            successMessage:
                request.query.success || null,
            errorMessage: null
        });
    } catch (error) {
        next(error);
    }
});

router.post("/", requireRole("Administrator"), async (
    request,
    response,
    next
) => {
    const organizationName =
        normalizeRequiredText(
            request.body.organization_name
        );

    const industry =
        normalizeOptionalText(
            request.body.industry
        );

    const logoPath =
        normalizeOptionalText(
            request.body.logo_path
        );

    const primaryColor =
        normalizeHexColor(
            request.body.primary_color,
            "#2563eb"
        );

    const secondaryColor =
        normalizeHexColor(
            request.body.secondary_color,
            "#1e293b"
        );

    const isActive =
        normalizeActiveStatus(
            request.body.is_active
        );

    try {
        const existingOrganization =
            await getOrganization();

        if (!existingOrganization) {
            response.status(404).send(
                "Organization not found."
            );

            return;
        }

        const organization = {
            ...existingOrganization,
            organization_name:
                organizationName,
            industry,
            logo_path: logoPath,
            primary_color:
                primaryColor,
            secondary_color:
                secondaryColor,
            is_active: isActive
        };

        if (!organizationName) {
            response.status(400).render(
                "settings/index",
                {
                    pageTitle: "Settings",
                    currentPage: "settings",
                    organization,
                    successMessage: null,
                    errorMessage:
                        "Organization name is required."
                }
            );

            return;
        }

        await runDatabase(
            `
                UPDATE organizations
                SET
                    organization_name = ?,
                    industry = ?,
                    logo_path = ?,
                    primary_color = ?,
                    secondary_color = ?,
                    is_active = ?
                WHERE organization_id = ?
            `,
            [
                organizationName,
                industry,
                logoPath,
                primaryColor,
                secondaryColor,
                isActive,
                organizationId
            ]
        );

        response.redirect(
            "/settings?success=" +
            encodeURIComponent(
                "Settings updated successfully."
            )
        );
    } catch (error) {
        next(error);
    }
});

module.exports = router;