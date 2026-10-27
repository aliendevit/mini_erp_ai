"""Add company-owned invoice payment details without replacing existing data."""
from alembic import op
import sqlalchemy as sa

revision = "20261025_02"
down_revision = "20260711_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    inspector = sa.inspect(op.get_bind())
    columns = {column["name"] for column in inspector.get_columns("CompanyProfile")}
    for name in ("taxNumber", "bankName", "iban", "bic"):
        if name not in columns:
            op.add_column("CompanyProfile", sa.Column(name, sa.String(), nullable=True))


def downgrade() -> None:
    for name in ("bic", "iban", "bankName", "taxNumber"):
        op.drop_column("CompanyProfile", name)
