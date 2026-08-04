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

function normalizeAssigneeIds(assigneeIds) {
    if (!assigneeIds) {
        return [];
    }

    const values = Array.isArray(assigneeIds)
        ? assigneeIds
        : [assigneeIds];

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

function normalizeNullableDate(dateValue) {
    if (!dateValue) {
        return null;
    }

    return dateValue.trim() || null;
}

function normalizeMaximumScore(scoreValue) {
    if (
        scoreValue === undefined ||
        scoreValue === null ||
        scoreValue === ""
    ) {
        return null;
    }

    const score = Number(scoreValue);

    if (!Number.isFinite(score) || score < 0) {
        return null;
    }

    return score;
}

function parseTaskForm(requestBody) {
    const allowedPriorities = [
        "Low",
        "Normal",
        "High",
        "Urgent"
    ];

    const allowedStatuses = [
        "Draft",
        "Open",
        "In Progress",
        "Completed",
        "Cancelled"
    ];

    const allowedSubmissionVisibilities = [
    "Private",
    "Shared"
    ];

    const workspaceId = Number(
        requestBody.workspace_id
    );

    const taskTitle =
        requestBody.task_title?.trim();

    const taskDescription =
        requestBody.task_description?.trim() ||
        null;

    const taskPriority =
        allowedPriorities.includes(
            requestBody.task_priority
        )
            ? requestBody.task_priority
            : "Normal";

    const taskStatus =
        allowedStatuses.includes(
            requestBody.task_status
        )
            ? requestBody.task_status
            : "Draft";

    const startDate = normalizeNullableDate(
        requestBody.start_date
    );

    const dueDate = normalizeNullableDate(
        requestBody.due_date
    );

    const submissionRequired =
    requestBody.submission_required === "1"
        ? 1
        : 0;

const submissionVisibility =
    submissionRequired === 1 &&
    allowedSubmissionVisibilities.includes(
        requestBody.submission_visibility
    )
        ? requestBody.submission_visibility
        : "Private";

    const maximumScore = normalizeMaximumScore(
        requestBody.maximum_score
    );

    const assigneeIds = normalizeAssigneeIds(
        requestBody.assignee_ids
    );

    return {
    workspaceId,
    taskTitle,
    taskDescription,
    taskPriority,
    taskStatus,
    startDate,
    dueDate,
    submissionRequired,
    submissionVisibility,
    maximumScore,
    assigneeIds
};
}

function createTaskFormData(taskData) {
    return {
        workspace_id: taskData.workspaceId || "",
        task_title: taskData.taskTitle || "",
        task_description:
            taskData.taskDescription || "",
        task_priority: taskData.taskPriority,
        task_status: taskData.taskStatus,
        start_date: taskData.startDate || "",
        due_date: taskData.dueDate || "",
        submission_required:
            taskData.submissionRequired,
        submission_visibility:
            taskData.submissionVisibility,
        maximum_score:
            taskData.maximumScore === null
                ? ""
                : taskData.maximumScore,
        assignee_ids: taskData.assigneeIds
    };
}

function datesAreInvalid(startDate, dueDate) {
    if (!startDate || !dueDate) {
        return false;
    }

    return (
        new Date(dueDate) <
        new Date(startDate)
    );
}

/*
|--------------------------------------------------------------------------
| Shared database queries
|--------------------------------------------------------------------------
*/

async function getOrganizationWorkspaces() {
    return allDatabase(
        `
            SELECT
                workspace_id,
                workspace_name,
                workspace_status
            FROM workspaces
            WHERE organization_id = ?
            ORDER BY
                workspace_status = 'Active' DESC,
                workspace_name ASC
        `,
        [organizationId]
    );
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

async function getTaskById(taskId) {
    return getDatabase(
        `
            SELECT
                tasks.task_id,
                tasks.workspace_id,
                tasks.created_by,
                tasks.task_title,
                tasks.task_description,
                tasks.task_priority,
                tasks.task_status,
                tasks.start_date,
                tasks.due_date,
                tasks.submission_required,
                tasks.submission_visibility,
                tasks.maximum_score,
                tasks.created_at,
                tasks.updated_at,
                workspaces.workspace_name,
                creator.full_name AS creator_name
            FROM tasks
            INNER JOIN workspaces
                ON tasks.workspace_id =
                   workspaces.workspace_id
            LEFT JOIN users AS creator
                ON tasks.created_by =
                   creator.user_id
            WHERE tasks.task_id = ?
              AND workspaces.organization_id = ?
        `,
        [taskId, organizationId]
    );
}

async function getTaskAssigneeIds(taskId) {
    const rows = await allDatabase(
        `
            SELECT user_id
            FROM task_assignees
            WHERE task_id = ?
        `,
        [taskId]
    );

    return rows.map((row) => row.user_id);
}

async function workspaceBelongsToOrganization(
    workspaceId
) {
    const workspace = await getDatabase(
        `
            SELECT workspace_id
            FROM workspaces
            WHERE workspace_id = ?
              AND organization_id = ?
        `,
        [workspaceId, organizationId]
    );

    return Boolean(workspace);
}

async function validateAssigneeIds(assigneeIds) {
    if (assigneeIds.length === 0) {
        return true;
    }

    const placeholders = assigneeIds
        .map(() => "?")
        .join(", ");

    const result = await getDatabase(
        `
            SELECT COUNT(*) AS valid_count
            FROM users
            WHERE organization_id = ?
              AND user_id IN (${placeholders})
        `,
        [organizationId, ...assigneeIds]
    );

    return (
        result.valid_count === assigneeIds.length
    );
}

async function insertTaskAssignees(
    taskId,
    assigneeIds
) {
    for (const assigneeId of assigneeIds) {
        await runDatabase(
            `
                INSERT INTO task_assignees (
                    task_id,
                    user_id,
                    assignment_status
                )
                VALUES (?, ?, ?)
            `,
            [
                taskId,
                assigneeId,
                "Assigned"
            ]
        );
    }
}

async function renderAddTaskError(
    response,
    workspaces,
    users,
    formData,
    errorMessage
) {
    return response.status(400).render(
        "tasks/add",
        {
            pageTitle: "Add Task",
            currentPage: "tasks",
            workspaces,
            users,
            formData,
            errorMessage
        }
    );
}

async function renderEditTaskError(
    response,
    workspaces,
    users,
    task,
    errorMessage
) {
    return response.status(400).render(
        "tasks/edit",
        {
            pageTitle: "Edit Task",
            currentPage: "tasks",
            workspaces,
            users,
            task,
            errorMessage
        }
    );
}

/*
|--------------------------------------------------------------------------
| List tasks
|--------------------------------------------------------------------------
*/

router.get("/", async (
    request,
    response,
    next
) => {
    try {
        const tasks = await allDatabase(
            `
                SELECT
                    tasks.task_id,
                    tasks.task_title,
                    tasks.task_priority,
                    tasks.task_status,
                    tasks.start_date,
                    tasks.due_date,
                    tasks.submission_required,
                    tasks.maximum_score,
                    tasks.created_at,
                    workspaces.workspace_name,
                    COUNT(
                        DISTINCT
                        task_assignees.user_id
                    ) AS assignee_count,
                    COUNT(
                        DISTINCT
                        submissions.submission_id
                    ) AS submission_count
                FROM tasks
                INNER JOIN workspaces
                    ON tasks.workspace_id =
                       workspaces.workspace_id
                LEFT JOIN task_assignees
                    ON tasks.task_id =
                       task_assignees.task_id
                LEFT JOIN submissions
                    ON tasks.task_id =
                       submissions.task_id
                WHERE workspaces.organization_id = ?
                GROUP BY
                    tasks.task_id,
                    tasks.task_title,
                    tasks.task_priority,
                    tasks.task_status,
                    tasks.start_date,
                    tasks.due_date,
                    tasks.submission_required,
                    tasks.maximum_score,
                    tasks.created_at,
                    workspaces.workspace_name
                ORDER BY tasks.created_at DESC
            `,
            [organizationId]
        );

        response.render("tasks/index", {
            pageTitle: "Tasks",
            currentPage: "tasks",
            tasks,
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
| Display add-task form
|--------------------------------------------------------------------------
*/

router.get("/add", requireRoles([
    "Administrator",
    "Manager"
]), async (
    request,
    response,
    next
) => {
    try {
        const workspaces =
            await getOrganizationWorkspaces();

        const users =
            await getOrganizationUsers();

        const requestedWorkspaceId = Number(
            request.query.workspace_id
        );

        const selectedWorkspaceId =
            Number.isInteger(requestedWorkspaceId) &&
            requestedWorkspaceId > 0
                ? requestedWorkspaceId
                : "";

        response.render("tasks/add", {
            pageTitle: "Add Task",
            currentPage: "tasks",
            workspaces,
            users,
            formData: {
                workspace_id:
                    selectedWorkspaceId,
                task_title: "",
                task_description: "",
                task_priority: "Normal",
                task_status: "Draft",
                start_date: "",
                due_date: "",
                submission_required: 1,
                submission_visibility: "Private",
                maximum_score: "",
                assignee_ids: []
            },
            errorMessage: null
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Create task
|--------------------------------------------------------------------------
*/

router.post("/add", requireRoles([
    "Administrator",
    "Manager"
]), async (
    request,
    response,
    next
) => {
    const taskData = parseTaskForm(
        request.body
    );

    const formData =
        createTaskFormData(taskData);

    try {
        const workspaces =
            await getOrganizationWorkspaces();

        const users =
            await getOrganizationUsers();

        if (
            !taskData.taskTitle ||
            !taskData.workspaceId
        ) {
            return renderAddTaskError(
                response,
                workspaces,
                users,
                formData,
                "Workspace and task title are required."
            );
        }

        const workspaceIsValid =
            await workspaceBelongsToOrganization(
                taskData.workspaceId
            );

        if (!workspaceIsValid) {
            return renderAddTaskError(
                response,
                workspaces,
                users,
                formData,
                "The selected workspace is invalid."
            );
        }

        const assigneesAreValid =
            await validateAssigneeIds(
                taskData.assigneeIds
            );

        if (!assigneesAreValid) {
            return renderAddTaskError(
                response,
                workspaces,
                users,
                formData,
                "One or more selected assignees are invalid."
            );
        }

        if (
            datesAreInvalid(
                taskData.startDate,
                taskData.dueDate
            )
        ) {
            return renderAddTaskError(
                response,
                workspaces,
                users,
                formData,
                "Due date cannot be earlier than the start date."
            );
        }

        await runDatabase(
            "BEGIN TRANSACTION"
        );

        try {
            const taskResult =
    await runDatabase(
        `
            INSERT INTO tasks (
                workspace_id,
                created_by,
                task_title,
                task_description,
                task_priority,
                task_status,
                start_date,
                due_date,
                submission_required,
                submission_visibility,
                maximum_score
            )
            VALUES (
                ?, ?, ?, ?, ?, ?,
                ?, ?, ?, ?, ?
            )
        `,
        [
            taskData.workspaceId,
            temporaryCreatorId,
            taskData.taskTitle,
            taskData.taskDescription,
            taskData.taskPriority,
            taskData.taskStatus,
            taskData.startDate,
            taskData.dueDate,
            taskData.submissionRequired,
            taskData.submissionVisibility,
            taskData.maximumScore
        ]
    );

            await insertTaskAssignees(
                taskResult.lastID,
                taskData.assigneeIds
            );

            await runDatabase("COMMIT");

            response.redirect(
                `/tasks/${taskResult.lastID}`
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
| Display edit-task form
|--------------------------------------------------------------------------
*/

router.get("/edit/:id", requireRoles([
    "Administrator",
    "Manager"
]), async (
    request,
    response,
    next
) => {
    const taskId = Number(
        request.params.id
    );

    if (
        !Number.isInteger(taskId) ||
        taskId <= 0
    ) {
        response.status(400).send(
            "Invalid task ID."
        );

        return;
    }

    try {
        const task = await getTaskById(
            taskId
        );

        if (!task) {
            response.status(404).send(
                "Task not found."
            );

            return;
        }

        const workspaces =
            await getOrganizationWorkspaces();

        const users =
            await getOrganizationUsers();

        const assigneeIds =
            await getTaskAssigneeIds(taskId);

        response.render("tasks/edit", {
            pageTitle: "Edit Task",
            currentPage: "tasks",
            workspaces,
            users,
            task: {
                ...task,
                start_date:
                    task.start_date || "",
                due_date:
                    task.due_date || "",
                submission_visibility:
                    task.submission_visibility,
                maximum_score:
                    task.maximum_score ?? "",
                assignee_ids: assigneeIds
            },
            errorMessage: null
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Update task
|--------------------------------------------------------------------------
*/

router.post("/edit/:id", requireRoles([
    "Administrator",
    "Manager"
]), async (
    request,
    response,
    next
) => {
    const taskId = Number(
        request.params.id
    );

    if (
        !Number.isInteger(taskId) ||
        taskId <= 0
    ) {
        response.status(400).send(
            "Invalid task ID."
        );

        return;
    }

    const taskData = parseTaskForm(
        request.body
    );

    try {
        const existingTask =
            await getTaskById(taskId);

        if (!existingTask) {
            response.status(404).send(
                "Task not found."
            );

            return;
        }

        const workspaces =
            await getOrganizationWorkspaces();

        const users =
            await getOrganizationUsers();

        const task = {
            ...existingTask,
            task_id: taskId,
            workspace_id:
                taskData.workspaceId || "",
            task_title:
                taskData.taskTitle || "",
            task_description:
                taskData.taskDescription || "",
            task_priority:
                taskData.taskPriority,
            task_status:
                taskData.taskStatus,
            start_date:
                taskData.startDate || "",
            due_date:
                taskData.dueDate || "",
            submission_required:
                taskData.submissionRequired,
            submission_visibility:
                taskData.submissionVisibility,
            maximum_score:
                taskData.maximumScore === null
                    ? ""
                    : taskData.maximumScore,
            assignee_ids:
                taskData.assigneeIds
        };

        if (
            !taskData.taskTitle ||
            !taskData.workspaceId
        ) {
            return renderEditTaskError(
                response,
                workspaces,
                users,
                task,
                "Workspace and task title are required."
            );
        }

        const workspaceIsValid =
            await workspaceBelongsToOrganization(
                taskData.workspaceId
            );

        if (!workspaceIsValid) {
            return renderEditTaskError(
                response,
                workspaces,
                users,
                task,
                "The selected workspace is invalid."
            );
        }

        const assigneesAreValid =
            await validateAssigneeIds(
                taskData.assigneeIds
            );

        if (!assigneesAreValid) {
            return renderEditTaskError(
                response,
                workspaces,
                users,
                task,
                "One or more selected assignees are invalid."
            );
        }

        if (
            datesAreInvalid(
                taskData.startDate,
                taskData.dueDate
            )
        ) {
            return renderEditTaskError(
                response,
                workspaces,
                users,
                task,
                "Due date cannot be earlier than the start date."
            );
        }

        await runDatabase(
            "BEGIN TRANSACTION"
        );

        try {
            await runDatabase(
    `
        UPDATE tasks
        SET
            workspace_id = ?,
            task_title = ?,
            task_description = ?,
            task_priority = ?,
            task_status = ?,
            start_date = ?,
            due_date = ?,
            submission_required = ?,
            submission_visibility = ?,
            maximum_score = ?,
            updated_at =
                CURRENT_TIMESTAMP
        WHERE task_id = ?
          AND workspace_id IN (
              SELECT workspace_id
              FROM workspaces
              WHERE organization_id = ?
          )
    `,
    [
        taskData.workspaceId,
        taskData.taskTitle,
        taskData.taskDescription,
        taskData.taskPriority,
        taskData.taskStatus,
        taskData.startDate,
        taskData.dueDate,
        taskData.submissionRequired,
        taskData.submissionVisibility,
        taskData.maximumScore,
        taskId,
        organizationId
    ]
);

            await runDatabase(
                `
                    DELETE FROM task_assignees
                    WHERE task_id = ?
                `,
                [taskId]
            );

            await insertTaskAssignees(
                taskId,
                taskData.assigneeIds
            );

            await runDatabase("COMMIT");

            response.redirect(
                `/tasks/${taskId}`
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
| Task details
|--------------------------------------------------------------------------
*/

router.get("/:id", async (
    request,
    response,
    next
) => {
    const taskId = Number(
        request.params.id
    );

    if (
        !Number.isInteger(taskId) ||
        taskId <= 0
    ) {
        response.status(400).send(
            "Invalid task ID."
        );

        return;
    }

    try {
        const task = await getTaskById(
            taskId
        );

        if (!task) {
            response.status(404).send(
                "Task not found."
            );

            return;
        }

        const assignees = await allDatabase(
            `
                SELECT
                    users.user_id,
                    users.full_name,
                    users.email_address,
                    users.is_active,
                    task_assignees.assignment_status,
                    task_assignees.assigned_at
                FROM task_assignees
                INNER JOIN users
                    ON task_assignees.user_id =
                       users.user_id
                WHERE task_assignees.task_id = ?
                ORDER BY users.full_name ASC
            `,
            [taskId]
        );

        const submissions = await allDatabase(
            `
                SELECT
                    submissions.submission_id,
                    submissions.submission_status,
                    submissions.version_number,
                    submissions.submitted_at,
                    users.full_name
                        AS submitted_by_name
                FROM submissions
                INNER JOIN users
                    ON submissions.submitted_by =
                       users.user_id
                WHERE submissions.task_id = ?
                ORDER BY
                    submissions.submitted_at DESC
            `,
            [taskId]
        );

        response.render("tasks/details", {
            pageTitle: task.task_title,
            currentPage: "tasks",
            task,
            assignees,
            submissions
        });
    } catch (error) {
        next(error);
    }
});

/*
|--------------------------------------------------------------------------
| Delete task
|--------------------------------------------------------------------------
*/

router.post("/:id/delete", requireRoles([
    "Administrator",
    "Manager"
]), async (
    request,
    response,
    next
) => {
    const taskId = Number(
        request.params.id
    );

    if (
        !Number.isInteger(taskId) ||
        taskId <= 0
    ) {
        response.status(400).send(
            "Invalid task ID."
        );

        return;
    }

    try {
        const task = await getTaskById(
            taskId
        );

        if (!task) {
            response.status(404).send(
                "Task not found."
            );

            return;
        }

        const submissionResult =
            await getDatabase(
                `
                    SELECT
                        COUNT(*) AS submission_count
                    FROM submissions
                    WHERE task_id = ?
                `,
                [taskId]
            );

        const submissionCount =
            submissionResult.submission_count;

        if (submissionCount > 0) {
            const message =
                `Cannot delete "${task.task_title}" ` +
                `because it contains ` +
                `${submissionCount} ` +
                `${submissionCount === 1
                    ? "submission"
                    : "submissions"}.`;

            response.redirect(
                `/tasks?error=${encodeURIComponent(
                    message
                )}`
            );

            return;
        }

        await runDatabase(
            "BEGIN TRANSACTION"
        );

        try {
            await runDatabase(
                `
                    DELETE FROM task_assignees
                    WHERE task_id = ?
                `,
                [taskId]
            );

            await runDatabase(
                `
                    DELETE FROM tasks
                    WHERE task_id = ?
                      AND workspace_id IN (
                          SELECT workspace_id
                          FROM workspaces
                          WHERE organization_id = ?
                      )
                `,
                [
                    taskId,
                    organizationId
                ]
            );

            await runDatabase("COMMIT");

            response.redirect(
                "/tasks?success=" +
                encodeURIComponent(
                    "Task deleted successfully."
                )
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