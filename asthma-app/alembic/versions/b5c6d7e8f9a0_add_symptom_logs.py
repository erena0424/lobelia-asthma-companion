"""Quick logs: timestamped "right now" symptom entries, several per day."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b5c6d7e8f9a0"
down_revision = "a4b5c6d7e8f9"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "symptom_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("breathing", postgresql.JSONB(), nullable=True),
        sa.Column("limiting_activity", sa.Boolean(), nullable=True),
        sa.Column("reliever_puffs", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("triggers", postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_symptom_logs_user_id", "symptom_logs", ["user_id"])
    op.create_index("ix_symptom_logs_local_date", "symptom_logs", ["local_date"])


def downgrade():
    op.drop_index("ix_symptom_logs_local_date", table_name="symptom_logs")
    op.drop_index("ix_symptom_logs_user_id", table_name="symptom_logs")
    op.drop_table("symptom_logs")
