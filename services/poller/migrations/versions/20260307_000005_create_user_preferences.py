"""create user_preferences table

Revision ID: 20260307_000005_create_user_preferences
Revises: 20260306_000004
Create Date: 2026-03-07 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260307_000005_create_user_preferences'
down_revision = '20260306_000004'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_preferences',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('chat_id', sa.String(length=255), nullable=False),
        sa.Column('active_hours_start', sa.String(length=5), server_default=sa.text("'00:00'"), nullable=False),
        sa.Column('active_hours_end', sa.String(length=5), server_default=sa.text("'23:59'"), nullable=False),
        sa.Column('location_subscriptions', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column('is_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.UniqueConstraint('chat_id')
    )


def downgrade():
    op.drop_table('user_preferences')
