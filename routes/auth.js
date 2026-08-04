const express = require("express");
const bcrypt = require("bcrypt");

const database = require("../database/database");

const {
    requireGuest,
    requireAuthentication
} = require("../middleware/auth");

const router = express.Router();

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

function normalizeEmail(value) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().toLowerCase();
}

/*
|--------------------------------------------------------------------------
| Display login page
|--------------------------------------------------------------------------
*/

router.get("/login", requireGuest, (
    request,
    response
) => {
    response.render("auth/login", {
        pageTitle: "Login",
        errorMessage: null,
        formData: {
            email_address: ""
        }
    });
});

/*
|--------------------------------------------------------------------------
| Process login
|--------------------------------------------------------------------------
*/

router.post("/login", requireGuest, async (
    request,
    response,
    next
) => {
    const emailAddress = normalizeEmail(
        request.body.email_address
    );

    const password =
        typeof request.body.password === "string"
            ? request.body.password
            : "";

    const formData = {
        email_address: emailAddress
    };

    try {
        if (!emailAddress || !password) {
            response.status(400).render(
                "auth/login",
                {
                    pageTitle: "Login",
                    errorMessage:
                        "Email address and password are required.",
                    formData
                }
            );

            return;
        }

        const user = await getDatabase(
            `
                SELECT
                    users.user_id,
                    users.organization_id,
                    users.role_id,
                    users.full_name,
                    users.email_address,
                    users.password_hash,
                    users.profile_image_path,
                    users.is_active,
                    roles.role_name,
                    organizations.organization_name,
                    organizations.is_active
                        AS organization_is_active
                FROM users
                INNER JOIN roles
                    ON users.role_id = roles.role_id
                INNER JOIN organizations
                    ON users.organization_id =
                       organizations.organization_id
                WHERE LOWER(users.email_address) = ?
                LIMIT 1
            `,
            [emailAddress]
        );

        if (!user) {
            response.status(401).render(
                "auth/login",
                {
                    pageTitle: "Login",
                    errorMessage:
                        "Invalid email address or password.",
                    formData
                }
            );

            return;
        }

        if (user.is_active !== 1) {
            response.status(403).render(
                "auth/login",
                {
                    pageTitle: "Login",
                    errorMessage:
                        "This user account is inactive.",
                    formData
                }
            );

            return;
        }

        if (user.organization_is_active !== 1) {
            response.status(403).render(
                "auth/login",
                {
                    pageTitle: "Login",
                    errorMessage:
                        "This organization is inactive.",
                    formData
                }
            );

            return;
        }

        const passwordIsValid =
            await bcrypt.compare(
                password,
                user.password_hash
            );

        if (!passwordIsValid) {
            response.status(401).render(
                "auth/login",
                {
                    pageTitle: "Login",
                    errorMessage:
                        "Invalid email address or password.",
                    formData
                }
            );

            return;
        }

        request.session.regenerate((error) => {
            if (error) {
                next(error);
                return;
            }

            request.session.user = {
                user_id: user.user_id,
                organization_id:
                    user.organization_id,
                role_id: user.role_id,
                role_name: user.role_name,
                full_name: user.full_name,
                email_address:
                    user.email_address,
                profile_image_path:
                    user.profile_image_path,
                organization_name:
                    user.organization_name
            };

            request.session.save((saveError) => {
                if (saveError) {
                    next(saveError);
                    return;
                }

                response.redirect("/");
            });
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Log out
|--------------------------------------------------------------------------
*/

router.post("/logout", requireAuthentication, (
    request,
    response,
    next
) => {
    request.session.destroy((error) => {
        if (error) {
            next(error);
            return;
        }

        response.clearCookie("connect.sid");
        response.redirect("/login");
    });
});

module.exports = router;