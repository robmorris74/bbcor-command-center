@echo off
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  py BBCOR_Expense_Export.py
) else (
  python BBCOR_Expense_Export.py
)
