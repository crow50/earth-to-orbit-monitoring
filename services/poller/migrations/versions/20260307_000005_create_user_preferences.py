"""create user_preferences table

Revision ID: 20260307_000005_create_user_preferences
Revises: 20260306_000004_add_fk_launches_pad_id
Create Date: 2026-03-07 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260307_000005_create_user_preferences'
down_revision = '20260306_000004_add_fk_launches_pad_id'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_preferences',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('chat_id', sa.String(length=255), nullable=False),
        sa.Column('active_hours_start', sa.String(length=5), server_default='00:00', nullable=False),
        sa.Column('active_hours_end', sa.String(length=5), server_default='23:59', nullable=False),
        sa.Column('location_subscriptions', postgresql.JSONB(astext_type=sa.Text()), server_default='[]', nullable=False),
        sa.Column('is_enabled', sa.Boolean(), server_default='true', nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('chat_id')
    )
    op.create_index(op.f('ix_user_preferences_chat_id'), 'user_preferences', ['chat_id'], unique=True)


def downgrade():
    op.drop_index(op.f('ix_user_preferences_chat_id'), table_name='user_preferences')
    op.drop_table('user_preferences')
