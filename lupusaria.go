package main

import (
	"context"
	"strings"
	"time"

	"LivePanel/internal/sip"
)

const lupusModuleID = "lupusaria"

func (a *App) GetLupusAriaFeatures() (sip.BotResponse, error) {
	client, err := a.sipClientForModule(lupusModuleID, "LupusAria")
	if err != nil {
		return sip.BotResponse{}, err
	}
	return client.GetBotFeatures(a.requestContext())
}

func (a *App) GetLupusAriaLogs() (sip.BotResponse, error) {
	client, err := a.sipClientForModule(lupusModuleID, "LupusAria")
	if err != nil {
		return sip.BotResponse{}, err
	}
	return client.GetBotLogs(a.requestContext())
}

func (a *App) SetLupusAriaFeature(id string, enabled bool) (result sip.BotResponse) {
	ctx, finish := a.beginAction(lupusModuleID, "feature_update")
	defer func() { finish(result.Success, result.Error, false) }()
	client, err := a.sipClientForModule(lupusModuleID, "LupusAria")
	if err != nil {
		return sip.BotResponse{Error: "LupusAria service is unavailable."}
	}
	result, err = client.SetBotFeature(ctx, id, enabled)
	if err != nil && result.Error == "" {
		result.Error = "LupusAria did not confirm the feature update."
	}
	return result
}

func (a *App) SetLupusAriaRunning(start bool) (result sip.BotResponse) {
	action := "stop_bot"
	if start {
		action = "start_bot"
	}
	ctx, finish := a.beginAction(lupusModuleID, action)
	defer func() { finish(result.Success, result.Error, false) }()
	modules, _ := a.service.Refresh(ctx)
	installed := false
	for _, module := range modules {
		if module.ID != lupusModuleID {
			continue
		}
		installed = module.Installed || module.Running
		if module.Running {
			supported := false
			for _, capability := range module.Capabilities {
				supported = supported || capability == "bot-lifecycle"
			}
			if !supported {
				return sip.BotResponse{Error: "This LupusAria version needs an update for LivePanel controls."}
			}
		}
	}
	if _, err := a.sipClientForModule(lupusModuleID, "LupusAria"); err != nil {
		if !start {
			return sip.BotResponse{Success: true, BotState: "offline"}
		}
		if !installed {
			return sip.BotResponse{BotState: "unavailable", Error: "LupusAria is not installed."}
		}
		if err := a.service.Start(ctx, lupusModuleID); err != nil {
			return sip.BotResponse{Error: "LupusAria service could not launch. Check Module Locations."}
		}
		wait, cancel := context.WithTimeout(ctx, 8*time.Second)
		defer cancel()
		if _, err := pollModules(wait, a.service, lupusModuleID); err != nil {
			return sip.BotResponse{Error: "LupusAria did not become ready. Check its startup log."}
		}
	}
	client, err := a.sipClientForModule(lupusModuleID, "LupusAria")
	if err != nil {
		return sip.BotResponse{Error: "LupusAria service is unavailable."}
	}
	result, err = client.SetBotRunning(ctx, start)
	if err != nil && strings.TrimSpace(result.Error) == "" {
		result.Error = "LupusAria did not confirm the bot state. Check Diagnostics."
	}
	return result
}
