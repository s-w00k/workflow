const express = require("express");
const database = require("../database/database");
const {
    requireRole,
    requireRoles
} = require("../middleware/auth");

const router = express.Router();

const organizationId = 1;
const temporaryCreatorId = 1;

/*
|--------------------------------------------------------------------------
| Database helpers
|--------------------------------------------------------------------------
*/

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

function allDatabase(sql, parameters = []) {
    return new Promise((resolve, reject) => {
        database.all(sql, parameters, (error, rows) => {
            if (error) {
                reject(error);
                return;
            }

            resolve(rows);
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
                lastID: this.lastID,
                changes: this.changes
            });
        });
    });
}

/*
|--------------------------------------------------------------------------
| General helpers
|--------------------------------------------------------------------------
*/

function normalizeMemberIds(memberIds) {
    if (!memberIds) {
        return [];
    }

    const values = Array.isArray(memberIds)
        ? memberIds
        : [memberIds];

    return [
        ...new Set(
            values
                .map((value) => Number(value))
                .filter(
                    (value) =>
                        Number.isInteger(value) &&
                        value > 0
                )
        )
    ];
}

async function getOrganizationUsers() {
    return allDatabase(
        `
            SELECT
                user_id,
                full_name,
                email_address,
                is_active
            FROM users
            WHERE organization_id = ?
            ORDER BY
                is_active DESC,
                full_name ASC
        `,
        [organizationId]
    );
}

async function getWorkspaceById(workspaceId) {
    return getDatabase(
        `
            SELECT
                workspaces.workspace_id,
                workspaces.organization_id,
                workspaces.workspace_name,
                workspaces.workspace_description,
                workspaces.workspace_status,
                workspaces.created_by,
                workspaces.created_at,
                creator.full_name AS creator_name
            FROM workspaces
            LEFT JOIN users AS creator
                ON workspaces.created_by = creator.user_id
            WHERE workspaces.workspace_id = ?
              AND workspaces.organization_id = ?
        `,
        [workspaceId, organizationId]
    );
}

async function getWorkspaceMemberIds(workspaceId) {
    const rows = await allDatabase(
        `
            SELECT user_id
            FROM workspace_members
            WHERE workspace_id = ?
        `,
        [workspaceId]
    );

    return rows.map((row) => row.user_id);
}

async function validateMemberIds(memberIds) {
    if (memberIds.length === 0) {
        return true;
    }

    const placeholders = memberIds
        .map(() => "?")
        .join(", ");

    const result = await getDatabase(
        `
            SELECT COUNT(*) AS valid_count
            FROM users
            WHERE organization_id = ?
              AND user_id IN (${placeholders})
        `,
        [organizationId, ...memberIds]
    );

    return result.valid_count === memberIds.length;
}

/*
|--------------------------------------------------------------------------
| List workspaces
|--------------------------------------------------------------------------
*/

router.get("/", async (request, response, next) => {
    try {
        const workspaces = await allDatabase(
            `
                SELECT
                    workspaces.workspace_id,
                    workspaces.workspace_name,
                    workspaces.workspace_description,
                    workspaces.workspace_status,
                    workspaces.created_at,
                    creator.full_name AS creator_name,
                    COUNT(
                        DISTINCT workspace_members.user_id
                    ) AS member_count,
                    COUNT(
                        DISTINCT tasks.task_id
                    ) AS task_count
                FROM workspaces
                LEFT JOIN users AS creator
                    ON workspaces.created_by = creator.user_id
                LEFT JOIN workspace_members
                    ON workspaces.workspace_id =
                       workspace_members.workspace_id
                LEFT JOIN tasks
                    ON workspaces.workspace_id =
                       tasks.workspace_id
                WHERE workspaces.organization_id = ?
                GROUP BY
                    workspaces.workspace_id,
                    workspaces.workspace_name,
                    workspaces.workspace_description,
                    workspaces.workspace_status,
                    workspaces.created_at,
                    creator.full_name
                ORDER BY workspaces.workspace_name ASC
            `,
            [organizationId]
        );

        response.render("workspaces/index", {
            pageTitle: "Workspaces",
            currentPage: "workspaces",
            workspaces,
            successMessage:
                request.query.success || null,
            errorMessage:
                request.query.error || null
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Add workspace form
|--------------------------------------------------------------------------
*/

router.get("/add", requireRole("Administrator"), async (request, response, next) => {
    try {
        const users = await getOrganizationUsers();

        response.render("workspaces/add", {
            pageTitle: "Add Workspace",
            currentPage: "workspaces",
            users,
            formData: {
                workspace_name: "",
                workspace_description: "",
                workspace_status: "Active",
                member_ids: []
            },
            errorMessage: null
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Create workspace
|--------------------------------------------------------------------------
*/

router.post("/add", requireRole("Administrator"), async (request, response, next) => {
    const workspaceName =
        request.body.workspace_name?.trim();

    const workspaceDescription =
        request.body.workspace_description?.trim() ||
        null;

    const allowedStatuses = [
        "Active",
        "Archived",
        "Completed"
    ];

    const workspaceStatus =
        allowedStatuses.includes(
            request.body.workspace_status
        )
            ? request.body.workspace_status
            : "Active";

    const memberIds = normalizeMemberIds(
        request.body.member_ids
    );

    const formData = {
        workspace_name: workspaceName || "",
        workspace_description:
            workspaceDescription || "",
        workspace_status: workspaceStatus,
        member_ids: memberIds
    };

    try {
        const users = await getOrganizationUsers();

        if (!workspaceName) {
            response.status(400).render(
                "workspaces/add",
                {
                    pageTitle: "Add Workspace",
                    currentPage: "workspaces",
                    users,
                    formData,
                    errorMessage:
                        "Workspace name is required."
                }
            );

            return;
        }

        const membersAreValid =
            await validateMemberIds(memberIds);

        if (!membersAreValid) {
            response.status(400).render(
                "workspaces/add",
                {
                    pageTitle: "Add Workspace",
                    currentPage: "workspaces",
                    users,
                    formData,
                    errorMessage:
                        "One or more selected users are invalid."
                }
            );

            return;
        }

        await runDatabase("BEGIN TRANSACTION");

        try {
            const workspaceResult =
                await runDatabase(
                    `
                        INSERT INTO workspaces (
                            organization_id,
                            workspace_name,
                            workspace_description,
                            workspace_status,
                            created_by
                        )
                        VALUES (?, ?, ?, ?, ?)
                    `,
                    [
                        organizationId,
                        workspaceName,
                        workspaceDescription,
                        workspaceStatus,
                        temporaryCreatorId
                    ]
                );

            for (const memberId of memberIds) {
                await runDatabase(
                    `
                        INSERT INTO workspace_members (
                            workspace_id,
                            user_id,
                            member_role
                        )
                        VALUES (?, ?, ?)
                    `,
                    [
                        workspaceResult.lastID,
                        memberId,
                        "Member"
                    ]
                );
            }

            await runDatabase("COMMIT");

            response.redirect(
                "/workspaces?success=Workspace created successfully."
            );
        } catch (error) {
            await runDatabase("ROLLBACK");
            throw error;
        }
    } catch (error) {
        if (
            error.message.includes(
                "UNIQUE constraint failed"
            )
        ) {
            const users = await getOrganizationUsers();

            response.status(409).render(
                "workspaces/add",
                {
                    pageTitle: "Add Workspace",
                    currentPage: "workspaces",
                    users,
                    formData,
                    errorMessage:
                        "A workspace with this name already exists."
                }
            );

            return;
        }

        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Workspace details
|--------------------------------------------------------------------------
*/

router.get("/:id", async (request, response, next) => {
    const workspaceId = Number(request.params.id);

    if (
        !Number.isInteger(workspaceId) ||
        workspaceId <= 0
    ) {
        response.status(400).send(
            "Invalid workspace ID."
        );

        return;
    }

    try {
        const workspace =
            await getWorkspaceById(workspaceId);

        if (!workspace) {
            response.status(404).send(
                "Workspace not found."
            );

            return;
        }

        const members = await allDatabase(
            `
                SELECT
                    users.user_id,
                    users.full_name,
                    users.email_address,
                    users.is_active,
                    workspace_members.member_role,
                    workspace_members.joined_at
                FROM workspace_members
                INNER JOIN users
                    ON workspace_members.user_id =
                       users.user_id
                WHERE workspace_members.workspace_id = ?
                ORDER BY users.full_name ASC
            `,
            [workspaceId]
        );

        const tasks = await allDatabase(
            `
                SELECT
                    task_id,
                    task_title,
                    task_priority,
                    task_status,
                    due_date
                FROM tasks
                WHERE workspace_id = ?
                ORDER BY created_at DESC
                LIMIT 10
            `,
            [workspaceId]
        );

        response.render("workspaces/details", {
            pageTitle: workspace.workspace_name,
            currentPage: "workspaces",
            workspace,
            members,
            tasks
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Edit workspace form
|--------------------------------------------------------------------------
*/

router.get("/edit/:id", requireRole("Administrator"), async (
    request,
    response,
    next
) => {
    const workspaceId = Number(request.params.id);

    if (
        !Number.isInteger(workspaceId) ||
        workspaceId <= 0
    ) {
        response.status(400).send(
            "Invalid workspace ID."
        );

        return;
    }

    try {
        const workspace =
            await getWorkspaceById(workspaceId);

        if (!workspace) {
            response.status(404).send(
                "Workspace not found."
            );

            return;
        }

        const users = await getOrganizationUsers();
        const memberIds =
            await getWorkspaceMemberIds(workspaceId);

        response.render("workspaces/edit", {
            pageTitle: "Edit Workspace",
            currentPage: "workspaces",
            users,
            workspace: {
                ...workspace,
                member_ids: memberIds
            },
            errorMessage: null
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Update workspace
|--------------------------------------------------------------------------
*/

router.post("/edit/:id", requireRole("Administrator"), async (
    request,
    response,
    next
) => {
    const workspaceId = Number(request.params.id);

    if (
        !Number.isInteger(workspaceId) ||
        workspaceId <= 0
    ) {
        response.status(400).send(
            "Invalid workspace ID."
        );

        return;
    }

    const workspaceName =
        request.body.workspace_name?.trim();

    const workspaceDescription =
        request.body.workspace_description?.trim() ||
        null;

    const allowedStatuses = [
        "Active",
        "Archived",
        "Completed"
    ];

    const workspaceStatus =
        allowedStatuses.includes(
            request.body.workspace_status
        )
            ? request.body.workspace_status
            : "Active";

    const memberIds = normalizeMemberIds(
        request.body.member_ids
    );

    try {
        const existingWorkspace =
            await getWorkspaceById(workspaceId);

        if (!existingWorkspace) {
            response.status(404).send(
                "Workspace not found."
            );

            return;
        }

        const users = await getOrganizationUsers();

        const workspace = {
            ...existingWorkspace,
            workspace_name: workspaceName || "",
            workspace_description:
                workspaceDescription || "",
            workspace_status: workspaceStatus,
            member_ids: memberIds
        };

        if (!workspaceName) {
            response.status(400).render(
                "workspaces/edit",
                {
                    pageTitle: "Edit Workspace",
                    currentPage: "workspaces",
                    users,
                    workspace,
                    errorMessage:
                        "Workspace name is required."
                }
            );

            return;
        }

        const membersAreValid =
            await validateMemberIds(memberIds);

        if (!membersAreValid) {
            response.status(400).render(
                "workspaces/edit",
                {
                    pageTitle: "Edit Workspace",
                    currentPage: "workspaces",
                    users,
                    workspace,
                    errorMessage:
                        "One or more selected users are invalid."
                }
            );

            return;
        }

        await runDatabase("BEGIN TRANSACTION");

        try {
            await runDatabase(
                `
                    UPDATE workspaces
                    SET
                        workspace_name = ?,
                        workspace_description = ?,
                        workspace_status = ?
                    WHERE workspace_id = ?
                      AND organization_id = ?
                `,
                [
                    workspaceName,
                    workspaceDescription,
                    workspaceStatus,
                    workspaceId,
                    organizationId
                ]
            );

            await runDatabase(
                `
                    DELETE FROM workspace_members
                    WHERE workspace_id = ?
                `,
                [workspaceId]
            );

            for (const memberId of memberIds) {
                await runDatabase(
                    `
                        INSERT INTO workspace_members (
                            workspace_id,
                            user_id,
                            member_role
                        )
                        VALUES (?, ?, ?)
                    `,
                    [
                        workspaceId,
                        memberId,
                        "Member"
                    ]
                );
            }

            await runDatabase("COMMIT");

            response.redirect(
                `/workspaces/${workspaceId}`
            );
        } catch (error) {
            await runDatabase("ROLLBACK");
            throw error;
        }
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Delete empty workspace
|--------------------------------------------------------------------------
*/

router.post("/:id/delete", requireRole("Administrator"), async (
    request,
    response,
    next
) => {
    const workspaceId = Number(request.params.id);

    if (
        !Number.isInteger(workspaceId) ||
        workspaceId <= 0
    ) {
        response.status(400).send(
            "Invalid workspace ID."
        );

        return;
    }

    try {
        const workspace =
            await getWorkspaceById(workspaceId);

        if (!workspace) {
            response.status(404).send(
                "Workspace not found."
            );

            return;
        }

        const taskResult = await getDatabase(
            `
                SELECT COUNT(*) AS task_count
                FROM tasks
                WHERE workspace_id = ?
            `,
            [workspaceId]
        );

        if (taskResult.task_count > 0) {
            const message =
                `Cannot delete "${workspace.workspace_name}" ` +
                `because it contains ${taskResult.task_count} ` +
                `${taskResult.task_count === 1
                    ? "task"
                    : "tasks"}.`;

            response.redirect(
                `/workspaces?error=${encodeURIComponent(
                    message
                )}`
            );

            return;
        }

        await runDatabase("BEGIN TRANSACTION");

        try {
            await runDatabase(
                `
                    DELETE FROM workspace_members
                    WHERE workspace_id = ?
                `,
                [workspaceId]
            );

            await runDatabase(
                `
                    DELETE FROM workspaces
                    WHERE workspace_id = ?
                      AND organization_id = ?
                `,
                [workspaceId, organizationId]
            );

            await runDatabase("COMMIT");

            response.redirect(
                "/workspaces?success=Workspace deleted successfully."
            );
        } catch (error) {
            await runDatabase("ROLLBACK");
            throw error;
        }
    } catch (error) {
        next(error);
    }
});

module.exports = router;