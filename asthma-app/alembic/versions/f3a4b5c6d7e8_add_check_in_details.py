"""Optional structured detail for the daily check-in (mood, 0-10 breathing scores, context)."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f3a4b5c6d7e8"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("check_ins", sa.Column("details", postgresql.JSONB(), nullable=True))


def downgrade():
    op.drop_column("check_ins", "details")
