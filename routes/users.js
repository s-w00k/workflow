const express = require("express");
const database = require("../database/database");
const {
    requireRoles,
    requireRole
} = require("../middleware/auth");
const router = express.Router();

/*
|--------------------------------------------------------------------------
| Helper functions
|--------------------------------------------------------------------------
*/

function getRolesForOrganization(organizationId) {
    const sql = `
        SELECT
            role_id,
            role_name
        FROM roles
        WHERE organization_id = ?
        ORDER BY role_name ASC
    `;

    return new Promise((resolve, reject) => {
        database.all(sql, [organizationId], (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows);
        });
    });
}

function getUserById(userId) {
    const sql = `
        SELECT
            users.user_id,
            users.organization_id,
            users.role_id,
            users.full_name,
            users.email_address,
            users.profile_image_path,
            users.is_active,
            roles.role_name
        FROM users
        LEFT JOIN roles
            ON users.role_id = roles.role_id
        WHERE users.user_id = ?
    `;

    return new Promise((resolve, reject) => {
        database.get(sql, [userId], (error, row) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(row);
        });
    });
}

/*
|--------------------------------------------------------------------------
| List all users
|--------------------------------------------------------------------------
*/

router.get("/", requireRoles([
        "Administrator",
        "Manager"
    ]), 
    (request, response, next) => {
    const sql = `
        SELECT
            users.user_id,
            users.full_name,
            users.email_address,
            users.profile_image_path,
            users.is_active,
            users.created_at,
            roles.role_name,
            organizations.organization_name
        FROM users
        INNER JOIN organizations
            ON users.organization_id = organizations.organization_id
        LEFT JOIN roles
            ON users.role_id = roles.role_id
        ORDER BY users.full_name ASC
    `;

    database.all(sql, [], (error, users) => {
        if (error) {
            next(error);
            return;
        }

        response.render("users/index", {
            pageTitle: "Users",
            currentPage: "users",
            users,
            successMessage: request.query.success || null,
            errorMessage: request.query.error || null
        });
    });
});

/*
|--------------------------------------------------------------------------
| Display add-user form
|--------------------------------------------------------------------------
*/

router.get("/add", requireRole("Administrator"), async (request, response, next) => {
    try {
        /*
         * Authentication does not exist yet, so we temporarily use the
         * seeded Demo Organization.
         */
        const organizationId = 1;
        const roles = await getRolesForOrganization(organizationId);

        response.render("users/add", {
            pageTitle: "Add User",
            currentPage: "users",
            roles,
            formData: {
                full_name: "",
                email_address: "",
                role_id: "",
                is_active: 1
            },
            errorMessage: null
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Create user
|--------------------------------------------------------------------------
*/

router.post("/add", requireRole("Administrator"), async (request, response, next) => {
    const organizationId = 1;

    const fullName = request.body.full_name?.trim();
    const emailAddress = request.body.email_address
        ?.trim()
        .toLowerCase();

    const roleId = request.body.role_id;
    const isActive = request.body.is_active === "1" ? 1 : 0;

    const formData = {
        full_name: fullName,
        email_address: emailAddress,
        role_id: roleId,
        is_active: isActive
    };

    try {
        const roles = await getRolesForOrganization(organizationId);

        if (!fullName || !emailAddress || !roleId) {
            response.status(400).render("users/add", {
                pageTitle: "Add User",
                currentPage: "users",
                roles,
                formData,
                errorMessage:
                    "Full name, email address, and role are required."
            });

            return;
        }

        if (!emailAddress.includes("@")) {
            response.status(400).render("users/add", {
                pageTitle: "Add User",
                currentPage: "users",
                roles,
                formData,
                errorMessage:
                    "Please enter a valid email address."
            });

            return;
        }

        const sql = `
            INSERT INTO users (
                organization_id,
                role_id,
                full_name,
                email_address,
                password_hash,
                is_active
            )
            VALUES (?, ?, ?, ?, ?, ?)
        `;

        /*
         * Authentication will be added later.
         * For now, the password hash is stored as NULL.
         */
        const temporaryPasswordHash = "__PENDING_PASSWORD_SETUP__";

const parameters = [
    organizationId,
    roleId,
    fullName,
    emailAddress,
    temporaryPasswordHash,
    isActive
];

        database.run(sql, parameters, function (error) {
            if (error) {
                if (
                    error.message.includes(
                        "UNIQUE constraint failed"
                    )
                ) {
                    response.status(409).render("users/add", {
                        pageTitle: "Add User",
                        currentPage: "users",
                        roles,
                        formData,
                        errorMessage:
                            "A user with this email address already exists."
                    });

                    return;
                }

                next(error);
                return;
            }

            response.redirect(
                "/users?success=User created successfully."
            );
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Display edit-user form
|--------------------------------------------------------------------------
*/

router.get("/edit/:id", requireRole("Administrator"), async (request, response, next) => {
    const userId = Number(request.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
        response.status(400).send("Invalid user ID.");
        return;
    }

    try {
        const user = await getUserById(userId);

        if (!user) {
            response.status(404).send("User not found.");
            return;
        }

        const roles = await getRolesForOrganization(
            user.organization_id
        );

        response.render("users/edit", {
            pageTitle: "Edit User",
            currentPage: "users",
            roles,
            user,
            errorMessage: null
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Update user
|--------------------------------------------------------------------------
*/

router.post("/edit/:id", requireRole("Administrator"), async (request, response, next) => {
    const userId = Number(request.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
        response.status(400).send("Invalid user ID.");
        return;
    }

    const fullName = request.body.full_name?.trim();
    const emailAddress = request.body.email_address
        ?.trim()
        .toLowerCase();

    const roleId = request.body.role_id;
    const isActive = request.body.is_active === "1" ? 1 : 0;

    try {
        const existingUser = await getUserById(userId);

        if (!existingUser) {
            response.status(404).send("User not found.");
            return;
        }

        const roles = await getRolesForOrganization(
            existingUser.organization_id
        );

        const user = {
            ...existingUser,
            full_name: fullName,
            email_address: emailAddress,
            role_id: roleId,
            is_active: isActive
        };

        if (!fullName || !emailAddress || !roleId) {
            response.status(400).render("users/edit", {
                pageTitle: "Edit User",
                currentPage: "users",
                roles,
                user,
                errorMessage:
                    "Full name, email address, and role are required."
            });

            return;
        }

        if (!emailAddress.includes("@")) {
            response.status(400).render("users/edit", {
                pageTitle: "Edit User",
                currentPage: "users",
                roles,
                user,
                errorMessage:
                    "Please enter a valid email address."
            });

            return;
        }

        const sql = `
            UPDATE users
            SET
                role_id = ?,
                full_name = ?,
                email_address = ?,
                is_active = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `;

        const parameters = [
            roleId,
            fullName,
            emailAddress,
            isActive,
            userId
        ];

        database.run(sql, parameters, function (error) {
            if (error) {
                if (
                    error.message.includes(
                        "UNIQUE constraint failed"
                    )
                ) {
                    response.status(409).render("users/edit", {
                        pageTitle: "Edit User",
                        currentPage: "users",
                        roles,
                        user,
                        errorMessage:
                            "Another user already uses this email address."
                    });

                    return;
                }

                next(error);
                return;
            }

            response.redirect(
                "/users?success=User updated successfully."
            );
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Activate or deactivate user
|--------------------------------------------------------------------------
*/

router.post("/:id/toggle-status", requireRole("Administrator"), async (
    request,
    response,
    next
) => {
    const userId = Number(request.params.id);

    if (!Number.isInteger(userId) || userId <= 0) {
        response.status(400).send("Invalid user ID.");
        return;
    }

    try {
        const user = await getUserById(userId);

        if (!user) {
            response.status(404).send("User not found.");
            return;
        }

        const newStatus = user.is_active === 1 ? 0 : 1;

        const sql = `
            UPDATE users
            SET
                is_active = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `;

        database.run(
            sql,
            [newStatus, userId],
            function (error) {
                if (error) {
                    next(error);
                    return;
                }

                const action = newStatus === 1
                    ? "activated"
                    : "deactivated";

                response.redirect(
                    `/users?success=User ${action} successfully.`
                );
            }
        );
    } catch (error) {
        next(error);
    }
});

module.exports = router;