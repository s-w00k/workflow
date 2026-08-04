PRAGMA foreign_keys = ON;

-- =====================================================
-- 1. ORGANIZATIONS
-- Each customer using the platform is an organization.
-- =====================================================

CREATE TABLE IF NOT EXISTS organizations (
    organization_id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_name TEXT NOT NULL,
    industry TEXT,
    logo_path TEXT,
    primary_color TEXT DEFAULT '#2563eb',
    secondary_color TEXT DEFAULT '#1e293b',
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- =====================================================
-- 2. ROLES
-- Roles are configurable within each organization.
-- Examples: Admin, Manager, Member, Reviewer.
-- =====================================================

CREATE TABLE IF NOT EXISTS roles (
    role_id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    role_name TEXT NOT NULL,
    role_description TEXT,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id)
        REFERENCES organizations(organization_id)
        ON DELETE CASCADE,

    UNIQUE (organization_id, role_name)
);


-- =====================================================
-- 3. USERS
-- Every person using the platform is stored as a user.
-- =====================================================

CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    full_name TEXT NOT NULL,
    email_address TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    profile_image_path TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id)
        REFERENCES organizations(organization_id)
        ON DELETE CASCADE,

    FOREIGN KEY (role_id)
        REFERENCES roles(role_id),

    UNIQUE (organization_id, email_address)
);


-- =====================================================
-- 4. GROUPS
-- Groups can represent teams, classes, departments,
-- cohorts, branches or other collections of users.
-- =====================================================

CREATE TABLE IF NOT EXISTS groups (
    group_id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    group_name TEXT NOT NULL,
    group_type TEXT,
    group_description TEXT,
    created_by INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id)
        REFERENCES organizations(organization_id)
        ON DELETE CASCADE,

    FOREIGN KEY (created_by)
        REFERENCES users(user_id)
        ON DELETE SET NULL,

    UNIQUE (organization_id, group_name)
);


-- =====================================================
-- 5. GROUP MEMBERS
-- Junction table for the many-to-many relationship
-- between users and groups.
-- =====================================================

CREATE TABLE IF NOT EXISTS group_members (
    group_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (group_id, user_id),

    FOREIGN KEY (group_id)
        REFERENCES groups(group_id)
        ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);


-- =====================================================
-- 6. WORKSPACES
-- Workspaces can represent projects, subjects, courses,
-- departments or client accounts.
-- =====================================================

CREATE TABLE IF NOT EXISTS workspaces (
    workspace_id INTEGER PRIMARY KEY AUTOINCREMENT,
    organization_id INTEGER NOT NULL,
    workspace_name TEXT NOT NULL,
    workspace_description TEXT,
    workspace_status TEXT NOT NULL DEFAULT 'Active'
        CHECK (workspace_status IN ('Active', 'Archived')),
    created_by INTEGER,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (organization_id)
        REFERENCES organizations(organization_id)
        ON DELETE CASCADE,

    FOREIGN KEY (created_by)
        REFERENCES users(user_id)
        ON DELETE SET NULL
);


-- =====================================================
-- 7. WORKSPACE MEMBERS
-- Users may belong to multiple workspaces.
-- =====================================================

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    member_role TEXT DEFAULT 'Member',
    joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (workspace_id, user_id),

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(workspace_id)
        ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);


-- =====================================================
-- 8. TASKS
-- Tasks contain work assigned within a workspace.
-- =====================================================

CREATE TABLE IF NOT EXISTS tasks (
    task_id INTEGER PRIMARY KEY AUTOINCREMENT,
    workspace_id INTEGER NOT NULL,
    created_by INTEGER,
    task_title TEXT NOT NULL,
    task_description TEXT,
    task_priority TEXT NOT NULL DEFAULT 'Normal'
        CHECK (
            task_priority IN (
                'Low',
                'Normal',
                'High',
                'Urgent'
            )
        ),
    task_status TEXT NOT NULL DEFAULT 'Draft'
        CHECK (
            task_status IN (
                'Draft',
                'Open',
                'In Progress',
                'Under Review',
                'Completed',
                'Cancelled'
            )
        ),
    start_date DATETIME,
    due_date DATETIME,
    submission_required INTEGER NOT NULL DEFAULT 1
        CHECK (submission_required IN (0, 1)),
    maximum_score REAL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (workspace_id)
        REFERENCES workspaces(workspace_id)
        ON DELETE CASCADE,

    FOREIGN KEY (created_by)
        REFERENCES users(user_id)
        ON DELETE SET NULL,

    CHECK (
        due_date IS NULL
        OR start_date IS NULL
        OR due_date >= start_date
    )
);


-- =====================================================
-- 9. TASK ASSIGNEES
-- Tasks may be assigned to multiple users.
-- =====================================================

CREATE TABLE IF NOT EXISTS task_assignees (
    task_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    assignment_status TEXT NOT NULL DEFAULT 'Assigned'
        CHECK (
            assignment_status IN (
                'Assigned',
                'In Progress',
                'Submitted',
                'Completed'
            )
        ),
    assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (task_id, user_id),

    FOREIGN KEY (task_id)
        REFERENCES tasks(task_id)
        ON DELETE CASCADE,

    FOREIGN KEY (user_id)
        REFERENCES users(user_id)
        ON DELETE CASCADE
);


-- =====================================================
-- 10. SUBMISSIONS
-- Users submit responses or files for assigned tasks.
-- =====================================================

CREATE TABLE IF NOT EXISTS submissions (
    submission_id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    submitted_by INTEGER NOT NULL,
    written_response TEXT,
    file_path TEXT,
    external_link TEXT,
    submission_status TEXT NOT NULL DEFAULT 'Submitted'
        CHECK (
            submission_status IN (
                'Draft',
                'Submitted',
                'Late',
                'Under Review',
                'Returned',
                'Approved',
                'Rejected'
            )
        ),
    version_number INTEGER NOT NULL DEFAULT 1
        CHECK (version_number >= 1),
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (task_id)
        REFERENCES tasks(task_id)
        ON DELETE CASCADE,

    FOREIGN KEY (submitted_by)
        REFERENCES users(user_id)
        ON DELETE CASCADE,

    UNIQUE (task_id, submitted_by, version_number)
);


-- =====================================================
-- INDEXES
-- These make commonly used searches faster.
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_users_organization
ON users(organization_id);

CREATE INDEX IF NOT EXISTS idx_groups_organization
ON groups(organization_id);

CREATE INDEX IF NOT EXISTS idx_workspaces_organization
ON workspaces(organization_id);

CREATE INDEX IF NOT EXISTS idx_tasks_workspace
ON tasks(workspace_id);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date
ON tasks(due_date);

CREATE INDEX IF NOT EXISTS idx_submissions_task
ON submissions(task_id);

CREATE INDEX IF NOT EXISTS idx_submissions_user
ON submissions(submitted_by);

-- =====================================================
-- SAMPLE DATA
-- =====================================================

INSERT OR IGNORE INTO organizations (
    organization_id,
    organization_name,
    industry
)
VALUES (
    1,
    'Demo Organization',
    'General'
);


INSERT OR IGNORE INTO roles (
    role_id,
    organization_id,
    role_name,
    role_description
)
VALUES
    (
        1,
        1,
        'Administrator',
        'Manages the organization and its users'
    ),
    (
        2,
        1,
        'Manager',
        'Creates workspaces, assigns tasks and reviews work'
    ),
    (
        3,
        1,
        'Member',
        'Completes tasks and submits work'
    );


INSERT OR IGNORE INTO users (
    user_id,
    organization_id,
    role_id,
    full_name,
    email_address,
    password_hash
)
VALUES
    (
        1,
        1,
        1,
        'Alex Administrator',
        'admin@example.com',
        'temporary-password'
    ),
    (
        2,
        1,
        2,
        'Morgan Manager',
        'manager@example.com',
        'temporary-password'
    ),
    (
        3,
        1,
        3,
        'Jamie Member',
        'jamie@example.com',
        'temporary-password'
    ),
    (
        4,
        1,
        3,
        'Taylor Member',
        'taylor@example.com',
        'temporary-password'
    );


INSERT OR IGNORE INTO groups (
    group_id,
    organization_id,
    group_name,
    group_type,
    group_description,
    created_by
)
VALUES (
    1,
    1,
    'Development Team',
    'Team',
    'Example group used for development and testing',
    1
);


INSERT OR IGNORE INTO group_members (
    group_id,
    user_id
)
VALUES
    (1, 2),
    (1, 3),
    (1, 4);


INSERT OR IGNORE INTO workspaces (
    workspace_id,
    organization_id,
    workspace_name,
    workspace_description,
    created_by
)
VALUES (
    1,
    1,
    'Website Project',
    'Example workspace for testing the platform',
    2
);


INSERT OR IGNORE INTO workspace_members (
    workspace_id,
    user_id,
    member_role
)
VALUES
    (1, 2, 'Manager'),
    (1, 3, 'Member'),
    (1, 4, 'Member');


INSERT OR IGNORE INTO tasks (
    task_id,
    workspace_id,
    created_by,
    task_title,
    task_description,
    task_priority,
    task_status,
    start_date,
    due_date,
    submission_required,
    maximum_score
)
VALUES
    (
        1,
        1,
        2,
        'Create homepage design',
        'Create and submit an initial homepage design.',
        'High',
        'Open',
        '2026-07-30 09:00:00',
        '2026-08-05 17:00:00',
        1,
        100
    ),
    (
        2,
        1,
        2,
        'Review project requirements',
        'Read the requirements and confirm completion.',
        'Normal',
        'Open',
        '2026-07-30 09:00:00',
        '2026-08-02 17:00:00',
        0,
        NULL
    );


INSERT OR IGNORE INTO task_assignees (
    task_id,
    user_id
)
VALUES
    (1, 3),
    (1, 4),
    (2, 3);