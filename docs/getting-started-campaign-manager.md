# Getting Started: Campaign Manager

Set up and run professional-grade field operations for your political campaign.

## Table of Contents

- [Overview](#overview)
- [Logging In](#logging-in)
- [Creating a Campaign](#creating-a-campaign)
- [Importing Voters](#importing-voters)
- [Voter Management](#voter-management)
- [Setting Up Surveys and Scripts](#setting-up-surveys-and-scripts)
- [Canvassing Setup](#canvassing-setup)
- [Phone Banking Setup](#phone-banking-setup)
- [Managing Volunteers](#managing-volunteers)
- [Campaign Settings](#campaign-settings)
- [Dashboard](#dashboard)
- [See Also](#see-also)

## Overview

As a campaign manager, CivicPulse Run gives you the tools to run a complete field operation:

- **Import and manage voter lists** from CSV files (including L2 voter file format)
- **Organize canvassing** with geographic turfs, walk lists, and mobile field mode
- **Run phone banks** with call lists, scripts, and DNC compliance
- **Coordinate volunteers** with self-service registration, shifts, and hour tracking
- **Track progress** with a real-time campaign dashboard

Before you begin, make sure your system administrator has deployed CivicPulse Run. See the [System Administrator Guide](getting-started-admin.md) for deployment instructions.

## Logging In

CivicPulse Run uses ZITADEL for authentication. Your login experience:

1. Navigate to your CivicPulse Run instance (e.g., `http://localhost:8000` for local development)
2. Click **Log In** -- you will be redirected to the ZITADEL login page
3. Enter your credentials (email and password) or use a configured identity provider
4. After successful authentication, you will be redirected back to CivicPulse Run

**First-time access:** If this is your first login, your system administrator may need to create your ZITADEL account. Once logged in, you can create or join campaigns.

## Creating a Campaign

1. From the home screen, click **New Campaign**
2. Fill in the campaign details:
   - **Name** -- Your campaign name (e.g., "Smith for City Council 2026")
   - **Description** -- Brief description of the campaign
3. Click **Create**

You are now the owner of this campaign with full administrative access.

## Importing Voters

Voter data is the foundation of your field operations. CivicPulse Run supports CSV file imports with flexible column mapping.

### Starting an import

1. Navigate to your campaign
2. Go to **Voters** > **Imports**
3. Click **New Import**
4. Upload your CSV file (the file is uploaded to secure storage via presigned URLs)

### Column mapping

After upload, you will map CSV columns to voter fields. Supported fields include:

| Field | Description | Example |
|-------|-------------|---------|
| First Name | Voter first name | Jane |
| Last Name | Voter last name | Smith |
| Street Address | Full street address | 123 Main St |
| City | City | Springfield |
| State | State abbreviation | IL |
| Zip Code | ZIP or ZIP+4 | 62701 |
| Phone | Phone number | (217) 555-0100 |
| Email | Email address | jane@example.com |
| Tags | Comma-separated tags | supporter, volunteer |

**L2 voter file format:** CivicPulse Run recognizes L2 voter file column naming conventions and can automatically map common L2 fields.

### Review and confirm

After mapping columns, review a preview of the import data before confirming. The import processes in the background -- you can navigate away and check progress later on the Imports page.

## Voter Management

### Voter lists

The main voter list shows all imported voters for your campaign. You can:

- **Search** by name, address, or other fields
- **Filter** by tags, import source, or contact history
- **Sort** by any column

### Tags

Tags help you organize voters into groups:

- Apply tags during import (via a CSV column) or manually
- Use tags to create targeted canvassing walk lists or phone bank call lists
- Common tags: `supporter`, `undecided`, `volunteer-prospect`, `do-not-contact`

### Voter detail view

Click any voter to see their full profile:

- Contact information
- Address with map view
- All tags
- Complete contact history (canvassing visits, phone calls, survey responses)

## Setting Up Surveys and Scripts

Surveys provide the scripts and questions your canvassers and phone bankers use when contacting voters.

### Creating a survey

1. Navigate to your campaign settings or the canvassing/phone banking section
2. Create a new survey script
3. Add questions with the appropriate response types:
   - **Multiple choice** -- Predefined answer options
   - **Yes/No** -- Simple binary response
   - **Text** -- Free-form notes
   - **Rating** -- Numeric scale

### Tips for effective scripts

- Keep the opening script friendly and brief
- Lead with your strongest issue question
- Include a voter ID question (support level 1-5)
- End with a volunteer recruitment ask
- Test the script with your team before deploying to the field

## Canvassing Setup

Canvassing is door-to-door voter contact. CivicPulse Run supports the full canvassing workflow from turf creation to field data collection.

### Creating turfs

Turfs are geographic areas assigned to canvassers.

1. Navigate to **Canvassing** > **Turfs**
2. Click **New Turf**
3. Define the turf boundary:
   - **Draw on map** -- Use the map drawing tools to outline a geographic area
   - **Import boundary** -- Upload a GeoJSON boundary file
4. Name the turf (e.g., "Ward 3 - North", "Precinct 12")
5. Save -- the system calculates how many voters fall within the boundary using PostGIS

### Generating walk lists

Walk lists are ordered sequences of doors for canvassers to visit.

1. Navigate to **Canvassing** > **Walk Lists**
2. Click **New Walk List**
3. Select a turf or apply voter filters (tags, contact history, etc.)
4. The system generates an optimized walking route
5. Assign the walk list to a volunteer

### Assigning volunteers

- Assign walk lists to specific volunteers from the walk list detail page
- Volunteers see their assigned walk lists in the mobile Field Mode
- Track completion progress in real time

## Phone Banking Setup

Phone banking lets your team make targeted voter contact calls with scripted conversations and automatic DNC compliance.

### Creating call lists

1. Navigate to **Phone Banking** > **Call Lists**
2. Click **New Call List**
3. Build the list by applying filters:
   - Voter tags (e.g., "undecided")
   - Geographic area
   - Contact history (e.g., "not contacted in 30 days")
4. Name the call list and save

### DNC management

CivicPulse Run enforces Do Not Call (DNC) compliance:

- **Import DNC lists** -- Upload DNC lists to automatically exclude numbers
- **Voter opt-out** -- Voters who request no further calls are flagged
- **Automatic filtering** -- Call lists automatically exclude DNC numbers

### Phone bank sessions

Sessions are time-bound calling events where multiple volunteers make calls simultaneously.

1. Navigate to **Phone Banking** > **Sessions**
2. Click **New Session**
3. Configure the session:
   - Select a call list
   - Set the session time window
   - Assign the survey script callers should use
4. Share the session with volunteers -- they join via the Phone Banking section in Field Mode

## Managing Volunteers

### Volunteer registration

CivicPulse Run supports self-service volunteer registration:

1. Go to **Volunteers** > **Registration**
2. Copy the **registration link** for your campaign
3. Share this link with prospective volunteers (via email, social media, your website)
4. Volunteers create their own accounts and are added to your campaign roster

### Roster view

The volunteer roster shows all registered volunteers with:

- Contact information
- Tags (e.g., "canvasser", "phone banker", "team lead")
- Shift history and total hours logged
- Current assignments

### Shifts

Organize volunteer time with the shift management system:

1. Navigate to **Volunteers** > **Shifts**
2. Create shift slots with date, time, location, and capacity
3. Volunteers can browse and sign up for available shifts
4. Track attendance and hours automatically

### Hour tracking

- Volunteers log their own hours through the app
- Managers can review and approve logged hours
- Export hour reports for recognition or compliance

## Campaign Settings

### General settings

Access campaign settings from the campaign menu:

- **Campaign name and description** -- Update your campaign details
- **Campaign status** -- Active or archived

### Member management

Control who has access to your campaign and what they can do:

- **Roles** -- Assign roles to campaign members (owner, manager, volunteer)
- **Invite members** -- Add staff members by email
- **Remove members** -- Revoke access as needed

### Danger zone

- **Archive campaign** -- Deactivate the campaign (data is preserved)
- **Delete campaign** -- Permanently remove the campaign and all associated data

## Dashboard

The campaign dashboard gives you a real-time view of your field operations:

- **Voter contact stats** -- Total contacts, contacts this week, contact rate
- **Canvassing progress** -- Turfs completed, doors knocked, survey responses
- **Phone banking progress** -- Calls made, call outcomes, sessions active
- **Volunteer activity** -- Active volunteers, hours logged, upcoming shifts
- **Recent activity feed** -- Latest field activity across all operations

Use the dashboard to identify areas that need attention and track progress toward your field goals.

## See Also

- [README.md](../README.md) -- Project overview and quick start
- [System Administrator Guide](getting-started-admin.md) -- Deploy and configure the platform
- [Volunteer Guide](getting-started-volunteer.md) -- Share this with your volunteers for onboarding
