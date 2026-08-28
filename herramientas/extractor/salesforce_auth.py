from __future__ import annotations

import os
import time
from dataclasses import dataclass

from selenium import webdriver
from selenium.webdriver.common.by import By


@dataclass(frozen=True)
class SalesforceConfig:
    url_base: str
    username: str
    password: str


def load_config() -> SalesforceConfig:
    config = SalesforceConfig(
        url_base=os.getenv("SALESFORCE_URL_BASE", "").rstrip("/"),
        username=os.getenv("SALESFORCE_USERNAME", ""),
        password=os.getenv("SALESFORCE_PASSWORD", ""),
    )
    missing = [
        name
        for name, value in {
            "SALESFORCE_URL_BASE": config.url_base,
            "SALESFORCE_USERNAME": config.username,
            "SALESFORCE_PASSWORD": config.password,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError(f"Faltan variables de entorno: {', '.join(missing)}")
    return config


def crear_driver(headless: bool = False) -> webdriver.Chrome:
    options = webdriver.ChromeOptions()
    options.page_load_strategy = "eager"
    if headless:
        options.add_argument("--headless=new")
        options.add_argument("--window-size=1920,1080")
    else:
        options.add_argument("--start-maximized")
    options.add_experimental_option("prefs", {"profile.managed_default_content_settings.images": 2})
    options.add_argument("--disable-notifications")
    options.add_argument("--disable-extensions")
    options.add_argument("--disable-background-networking")
    options.add_argument("--no-sandbox")
    return webdriver.Chrome(options=options)


def login(driver: webdriver.Chrome, config: SalesforceConfig, max_intentos: int = 3) -> bool:
    for intento in range(1, max_intentos + 1):
        try:
            driver.get(config.url_base)
            time.sleep(5)
            for frame in driver.find_elements(By.TAG_NAME, "iframe"):
                driver.switch_to.frame(frame)
                if driver.find_elements(By.ID, "username") or driver.find_elements(By.NAME, "username"):
                    break
                driver.switch_to.default_content()

            def first(selectors):
                for by, selector in selectors:
                    elements = driver.find_elements(by, selector)
                    if elements:
                        return elements[0]
                return None

            username = first(
                [
                    (By.ID, "username"),
                    (By.NAME, "username"),
                    (By.CSS_SELECTOR, "input[type='email']"),
                    (By.CSS_SELECTOR, "input[type='text']"),
                ]
            )
            password = first(
                [
                    (By.ID, "password"),
                    (By.NAME, "password"),
                    (By.CSS_SELECTOR, "input[type='password']"),
                ]
            )
            if not username or not password:
                driver.switch_to.default_content()
                return True
            username.clear()
            username.send_keys(config.username)
            password.clear()
            password.send_keys(config.password)
            submit = first(
                [
                    (By.ID, "Login"),
                    (By.NAME, "Login"),
                    (By.CSS_SELECTOR, "input[type='submit']"),
                    (By.CSS_SELECTOR, "button[type='submit']"),
                ]
            )
            if submit:
                submit.click()
            else:
                password.submit()
            driver.switch_to.default_content()
            time.sleep(5)
            if "login" not in driver.current_url.lower():
                return True
        except Exception:
            driver.switch_to.default_content()
            if intento == max_intentos:
                return False
            time.sleep(3)
    return False