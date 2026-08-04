const express = require("express");
const path = require("path");
const session = require("express-session");

const database = require("./database/database");

const authRouter = require("./routes/auth");
const groupsRouter = require("./routes/groups");
const usersRouter = require("./routes/users");
const rolesRouter = require("./routes/roles");
const workspacesRouter = require("./routes/workspaces");
const tasksRouter = require("./routes/tasks");
const submissionsRouter = require("./routes/submissions");
const settingsRouter = require("./routes/settings");

const {
    requireAuthentication,
    attachCurrentUser
} = require("./middleware/auth");

const app = express();
const port = process.env.PORT || 3000;

/*
|--------------------------------------------------------------------------
| Application configuration
|--------------------------------------------------------------------------
*/

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
    express.static(path.join(__dirname, "public"))
);

/*
|--------------------------------------------------------------------------
| Session configuration
|--------------------------------------------------------------------------
*/

app.use(
    session({
        secret:
            process.env.SESSION_SECRET ||
            "development-session-secret-change-me",

        resave: false,

        saveUninitialized: false,

        cookie: {
            httpOnly: true,
            sameSite: "lax",
            secure: false,
            maxAge: 1000 * 60 * 60 * 8
        }
    })
);

/*
|--------------------------------------------------------------------------
| Current user
|--------------------------------------------------------------------------
*/

app.use(attachCurrentUser);

/*
|--------------------------------------------------------------------------
| Public authentication routes
|--------------------------------------------------------------------------
*/

app.use(authRouter);

/*
|--------------------------------------------------------------------------
| Protect all routes below this point
|--------------------------------------------------------------------------
*/

app.use(requireAuthentication);

/*
|--------------------------------------------------------------------------
| Dashboard
|--------------------------------------------------------------------------
*/

app.get("/", (request, response) => {
    response.redirect("/dashboard");
});

app.get("/dashboard", (request, response, next) => {
    const dashboardData = {
        organizationCount: 0,
        userCount: 0,
        workspaceCount: 0,
        taskCount: 0,
        recentTasks: []
    };

    const organizationCountSql = `
        SELECT COUNT(*) AS count
        FROM organizations
        WHERE is_active = 1
    `;

    const userCountSql = `
        SELECT COUNT(*) AS count
        FROM users
        WHERE is_active = 1
    `;

    const workspaceCountSql = `
        SELECT COUNT(*) AS count
        FROM workspaces
        WHERE workspace_status = 'Active'
    `;

    const taskCountSql = `
        SELECT COUNT(*) AS count
        FROM tasks
        WHERE task_status NOT IN (
            'Completed',
            'Cancelled'
        )
    `;

    const recentTasksSql = `
        SELECT
            tasks.task_id,
            tasks.task_title,
            tasks.task_priority,
            tasks.task_status,
            tasks.due_date,
            workspaces.workspace_name
        FROM tasks
        INNER JOIN workspaces
            ON tasks.workspace_id =
               workspaces.workspace_id
        ORDER BY tasks.created_at DESC
        LIMIT 5
    `;

    database.get(
        organizationCountSql,
        [],
        (
            organizationError,
            organizationResult
        ) => {
            if (organizationError) {
                next(organizationError);
                return;
            }

            dashboardData.organizationCount =
                organizationResult.count;

            database.get(
                userCountSql,
                [],
                (userError, userResult) => {
                    if (userError) {
                        next(userError);
                        return;
                    }

                    dashboardData.userCount =
                        userResult.count;

                    database.get(
                        workspaceCountSql,
                        [],
                        (
                            workspaceError,
                            workspaceResult
                        ) => {
                            if (workspaceError) {
                                next(workspaceError);
                                return;
                            }

                            dashboardData.workspaceCount =
                                workspaceResult.count;

                            database.get(
                                taskCountSql,
                                [],
                                (
                                    taskError,
                                    taskResult
                                ) => {
                                    if (taskError) {
                                        next(taskError);
                                        return;
                                    }

                                    dashboardData.taskCount =
                                        taskResult.count;

                                    database.all(
                                        recentTasksSql,
                                        [],
                                        (
                                            recentTasksError,
                                            recentTasks
                                        ) => {
                                            if (
                                                recentTasksError
                                            ) {
                                                next(
                                                    recentTasksError
                                                );

                                                return;
                                            }

                                            dashboardData.recentTasks =
                                                recentTasks;

                                            response.render(
                                                "dashboard",
                                                {
                                                    pageTitle:
                                                        "Dashboard",

                                                    currentPage:
                                                        "dashboard",

                                                    dashboardData
                                                }
                                            );
                                        }
                                    );
                                }
                            );
                        }
                    );
                }
            );
        }
    );
});

/*
|--------------------------------------------------------------------------
| Module routes
|--------------------------------------------------------------------------
*/

app.use("/users", usersRouter);
app.use("/roles", rolesRouter);
app.use("/groups", groupsRouter);
app.use("/workspaces", workspacesRouter);
app.use("/tasks", tasksRouter);
app.use("/submissions", submissionsRouter);
app.use("/settings", settingsRouter);

/*
|--------------------------------------------------------------------------
| Not found
|--------------------------------------------------------------------------
*/

app.use((request, response) => {
    response.status(404).send("Page not found.");
});

/*
|--------------------------------------------------------------------------
| Error handler
|--------------------------------------------------------------------------
*/

app.use((error, request, response, next) => {
    console.error(error);

    response.status(500).send(
        "An unexpected server error occurred."
    );
});

/*
|--------------------------------------------------------------------------
| Start server
|--------------------------------------------------------------------------
*/

app.listen(port, () => {
    console.log(
        `Server running at http://localhost:${port}`
    );
});