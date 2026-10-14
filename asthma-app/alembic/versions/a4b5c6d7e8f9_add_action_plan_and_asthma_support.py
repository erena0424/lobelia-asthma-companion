"""User-entered asthma action plan (green/yellow/red) and asthma support info."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a4b5c6d7e8f9"
down_revision = "f3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("action_plan", postgresql.JSONB(), nullable=True))
    op.add_column("users", sa.Column("asthma_support", postgresql.JSONB(), nullable=True))


def downgrade():
    op.drop_column("users", "asthma_support")
    op.drop_column("users", "action_plan")
