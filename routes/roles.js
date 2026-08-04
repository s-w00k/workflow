const express = require("express");
const database = require("../database/database");
const {
    requireRole,
    requireRoles
} = require("../middleware/auth");

const router = express.Router();


/*
|--------------------------------------------------------------------------
| Database helpers
|--------------------------------------------------------------------------
*/

function getRoleById(
    roleId,
    organizationId
) {
    const sql = `
        SELECT
            role_id,
            organization_id,
            role_name,
            role_description,
            created_at
        FROM roles
        WHERE role_id = ?
          AND organization_id = ?
    `;

    return new Promise((resolve, reject) => {
        database.get(
            sql,
            [roleId, organizationId],
            (error, role) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(role);
            }
        );
    });
}

function getRoleUserCount(
    roleId,
    organizationId
) {
    const sql = `
        SELECT COUNT(*) AS user_count
        FROM users
        WHERE role_id = ?
          AND organization_id = ?
    `;

    return new Promise((resolve, reject) => {
        database.get(
            sql,
            [roleId, organizationId],
            (error, result) => {
                if (error) {
                    reject(error);
                    return;
                }

                resolve(result.user_count);
            }
        );
    });
}

/*
|--------------------------------------------------------------------------
| List roles
|--------------------------------------------------------------------------
*/

router.get("/", requireRoles([
        "Administrator",
        "Manager"
    ]), (request, response, next) => {

        const organizationId = request.session.user.organization_id;

    const sql = `
        SELECT
            roles.role_id,
            roles.role_name,
            roles.role_description,
            roles.created_at,
            COUNT(users.user_id) AS user_count
        FROM roles
        LEFT JOIN users
            ON roles.role_id = users.role_id
           AND roles.organization_id = users.organization_id
        WHERE roles.organization_id = ?
        GROUP BY
            roles.role_id,
            roles.role_name,
            roles.role_description,
            roles.created_at
        ORDER BY roles.role_name ASC
    `;

    database.all(
        sql,
        [organizationId],
        (error, roles) => {
            if (error) {
                next(error);
                return;
            }

            response.render("roles/index", {
                pageTitle: "Roles",
                currentPage: "roles",
                roles,
                successMessage: request.query.success || null,
                errorMessage: request.query.error || null
            });
        }
    );
});

/*
|--------------------------------------------------------------------------
| Display add-role form
|--------------------------------------------------------------------------
*/

router.get("/add", requireRole("Administrator"), (request, response) => {
    
    response.render("roles/add", {
        pageTitle: "Add Role",
        currentPage: "roles",
        formData: {
            role_name: "",
            role_description: ""
        },
        errorMessage: null
    });
});

/*
|--------------------------------------------------------------------------
| Create role
|--------------------------------------------------------------------------
*/

router.post("/add", requireRole("Administrator"), (request, response, next) => {
    
    const organizationId = request.session.user.organization_id;
    
    const roleName = request.body.role_name?.trim();
    const roleDescription =
        request.body.role_description?.trim() || null;

    const formData = {
        role_name: roleName,
        role_description: roleDescription || ""
    };

    if (!roleName) {
        response.status(400).render("roles/add", {
            pageTitle: "Add Role",
            currentPage: "roles",
            formData,
            errorMessage: "Role name is required."
        });

        return;
    }

    const sql = `
        INSERT INTO roles (
            organization_id,
            role_name,
            role_description
        )
        VALUES (?, ?, ?)
    `;

    database.run(
        sql,
        [
            organizationId,
            roleName,
            roleDescription
        ],
        function (error) {
            if (error) {
                if (
                    error.message.includes(
                        "UNIQUE constraint failed"
                    )
                ) {
                    response.status(409).render("roles/add", {
                        pageTitle: "Add Role",
                        currentPage: "roles",
                        formData,
                        errorMessage:
                            "A role with this name already exists."
                    });

                    return;
                }

                next(error);
                return;
            }

            response.redirect(
                "/roles?success=Role created successfully."
            );
        }
    );
});

/*
|--------------------------------------------------------------------------
| Display edit-role form
|--------------------------------------------------------------------------
*/

router.get("/edit/:id", requireRole("Administrator"),  async (
    request,
    response,
    next
) => {

    const organizationId = request.session.user.organization_id;

    const roleId = Number(request.params.id);

    if (!Number.isInteger(roleId) || roleId <= 0) {
        response.status(400).send("Invalid role ID.");
        return;
    }

    try {
        const role = await getRoleById(
    roleId,
    organizationId
);

        if (!role) {
            response.status(404).send("Role not found.");
            return;
        }

        const userCount = await getRoleUserCount(
        roleId,
        organizationId
    );

        response.render("roles/edit", {
            pageTitle: "Edit Role",
            currentPage: "roles",
            role,
            userCount,
            errorMessage: null
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Update role
|--------------------------------------------------------------------------
*/

router.post("/edit/:id", requireRole("Administrator"), async (
    request,
    response,
    next
) => {

    const organizationId = request.session.user.organization_id;

    const roleId = Number(request.params.id);

    if (!Number.isInteger(roleId) || roleId <= 0) {
        response.status(400).send("Invalid role ID.");
        return;
    }

    const roleName = request.body.role_name?.trim();
    const roleDescription =
        request.body.role_description?.trim() || null;

    try {
        const existingRole = await getRoleById(
        roleId,
        organizationId
    );

        if (!existingRole) {
            response.status(404).send("Role not found.");
            return;
        }

        const userCount = await getRoleUserCount(
        roleId,
        organizationId
    );

        const role = {
            ...existingRole,
            role_name: roleName,
            role_description: roleDescription || ""
        };

        if (!roleName) {
            response.status(400).render("roles/edit", {
                pageTitle: "Edit Role",
                currentPage: "roles",
                role,
                userCount,
                errorMessage: "Role name is required."
            });

            return;
        }

        const sql = `
            UPDATE roles
            SET
                role_name = ?,
                role_description = ?
            WHERE role_id = ?
              AND organization_id = ?
        `;

        database.run(
            sql,
            [
                roleName,
                roleDescription,
                roleId,
                organizationId
            ],
            function (error) {
                if (error) {
                    if (
                        error.message.includes(
                            "UNIQUE constraint failed"
                        )
                    ) {
                        response.status(409).render(
                            "roles/edit",
                            {
                                pageTitle: "Edit Role",
                                currentPage: "roles",
                                role,
                                userCount,
                                errorMessage:
                                    "Another role already uses this name."
                            }
                        );

                        return;
                    }

                    next(error);
                    return;
                }

                response.redirect(
                    "/roles?success=Role updated successfully."
                );
            }
        );
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Delete role
|--------------------------------------------------------------------------
*/

router.post("/:id/delete", requireRole("Administrator"), async (
    request,
    response,
    next
) => {

    const organizationId = request.session.user.organization_id;
    
    const roleId = Number(request.params.id);

    if (!Number.isInteger(roleId) || roleId <= 0) {
        response.status(400).send("Invalid role ID.");
        return;
    }

    try {
        const role = await getRoleById(
        roleId,
        organizationId
    );

        if (!role) {
            response.status(404).send("Role not found.");
            return;
        }

        const userCount = await getRoleUserCount(
        roleId,
        organizationId
    );

        if (userCount > 0) {
            response.redirect(
                `/roles?error=${encodeURIComponent(
                    `Cannot delete "${role.role_name}" because ${userCount} user${userCount === 1 ? " is" : "s are"} assigned to it.`
                )}`
            );

            return;
        }

        const sql = `
            DELETE FROM roles
            WHERE role_id = ?
              AND organization_id = ?
        `;

        database.run(
            sql,
            [roleId, organizationId],
            function (error) {
                if (error) {
                    next(error);
                    return;
                }

                response.redirect(
                    "/roles?success=Role deleted successfully."
                );
            }
        );
    } catch (error) {
        next(error);
    }
});

module.exports = router;